// ============================================================================
// CineMega — On-Demand Video Thumbnail Generator & 30-Second Singleton Queue
// ============================================================================
// Enforces a module-level singleton queue with a strict 30-second delay per
// thumbnail (`ON_DEMAND_THUMBNAIL_DELAY_MS = 30_000`).
// Tracks attempted, completed, pending, and failed videos, skips failed items
// until the current pass completes, and provides immediate generation for
// admin manual requests.

import type { VideoItem } from '../types/cinemega';
import { apiWorkerPool } from './apiBase';

export const ON_DEMAND_THUMBNAIL_DELAY_MS = 30_000;

export type ThumbnailQueueStatus =
  | 'Temp Thumbnail'
  | 'Temp · 30s On-Demand Queue'
  | 'Capturing Thumbnail...'
  | 'Temp · Retry After Queue'
  | 'Completed';

export interface ThumbnailQueueSnapshot {
  isProcessing: boolean;
  pendingIds: string[];
  attemptedIds: string[];
  completedIds: string[];
  failedIds: string[];
  activeVideoId: string | null;
  statusByVideoId: Record<string, ThumbnailQueueStatus>;
}

type QueueListener = (snapshot: ThumbnailQueueSnapshot) => void;

class OnDemandThumbnailQueue {
  private pendingQueue: VideoItem[] = [];
  private attemptedSet = new Set<string>();
  private completedSet = new Set<string>();
  private failedSet = new Set<string>();
  private statusMap = new Map<string, ThumbnailQueueStatus>();
  private activeVideoId: string | null = null;
  private isProcessing = false;
  private listeners = new Set<QueueListener>();
  private delayMs = ON_DEMAND_THUMBNAIL_DELAY_MS;

  /**
   * Allows tests to override the queue delay while production uses 30,000ms.
   */
  public setQueueDelayForTest(ms: number): void {
    this.delayMs = ms;
  }

  public getQueueDelayMs(): number {
    return this.delayMs;
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  public getSnapshot(): ThumbnailQueueSnapshot {
    const statusByVideoId: Record<string, ThumbnailQueueStatus> = {};
    for (const [vid, st] of this.statusMap.entries()) {
      statusByVideoId[vid] = st;
    }
    return {
      isProcessing: this.isProcessing,
      pendingIds: this.pendingQueue.map((v) => v.id),
      attemptedIds: Array.from(this.attemptedSet),
      completedIds: Array.from(this.completedSet),
      failedIds: Array.from(this.failedSet),
      activeVideoId: this.activeVideoId,
      statusByVideoId,
    };
  }

  public getStatusForVideo(video: VideoItem): ThumbnailQueueStatus {
    if (video.thumbnailFileName || this.completedSet.has(video.id)) {
      return 'Completed';
    }
    return this.statusMap.get(video.id) || 'Temp Thumbnail';
  }

  /**
   * Enqueues visible videos lacking real thumbnails without duplicating queue initialization.
   */
  public enqueueVideos(
    videos: VideoItem[],
    onThumbnailSaved?: (videoId: string, fileName: string) => void
  ): void {
    let added = false;
    for (const vid of videos) {
      if (!vid || !vid.id) continue;
      if (vid.thumbnailFileName || this.completedSet.has(vid.id)) {
        this.completedSet.add(vid.id);
        this.statusMap.set(vid.id, 'Completed');
        continue;
      }

      const alreadyQueued = this.pendingQueue.some((p) => p.id === vid.id);
      if (alreadyQueued || this.activeVideoId === vid.id) {
        continue;
      }

      // Skip failed videos during current pass
      if (this.failedSet.has(vid.id)) {
        this.statusMap.set(vid.id, 'Temp · Retry After Queue');
        continue;
      }

      this.pendingQueue.push(vid);
      this.statusMap.set(vid.id, 'Temp · 30s On-Demand Queue');
      added = true;
    }

    if (added) {
      this.notify();
    }

    if (!this.isProcessing && this.pendingQueue.length > 0) {
      void this.runQueueLoop(onThumbnailSaved);
    }
  }

  private async runQueueLoop(
    onThumbnailSaved?: (videoId: string, fileName: string) => void
  ): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.notify();

    while (this.pendingQueue.length > 0) {
      // Wait the strict 30-second delay per thumbnail in the on-demand queue
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));

      const nextVideo = this.pendingQueue.shift();
      if (!nextVideo) break;

      if (nextVideo.thumbnailFileName || this.completedSet.has(nextVideo.id)) {
        this.statusMap.set(nextVideo.id, 'Completed');
        this.notify();
        continue;
      }

      this.activeVideoId = nextVideo.id;
      this.attemptedSet.add(nextVideo.id);
      this.statusMap.set(nextVideo.id, 'Capturing Thumbnail...');
      this.notify();

      try {
        const result = await this.captureAndUploadVideoThumbnail(nextVideo);
        this.completedSet.add(nextVideo.id);
        this.failedSet.delete(nextVideo.id);
        this.statusMap.set(nextVideo.id, 'Completed');
        if (onThumbnailSaved) {
          onThumbnailSaved(nextVideo.id, result.fileName);
        }
      } catch {
        this.failedSet.add(nextVideo.id);
        this.statusMap.set(nextVideo.id, 'Temp · Retry After Queue');
      } finally {
        this.activeVideoId = null;
        this.notify();
      }
    }

    this.isProcessing = false;
    this.notify();
  }

  /**
   * Captures a frame from the video stream in the browser (or renders a clean cinema canvas frame
   * if headless video decoding is unavailable) and uploads it to `/api/thumbnails/on-demand`.
   */
  public async captureAndUploadVideoThumbnail(video: VideoItem): Promise<{
    fileName: string;
    url: string;
  }> {
    const base64Data = await this.captureBrowserFrameOrCanvas(video);
    const response = await apiWorkerPool.fetchApi<{
      saved: boolean;
      videoId: string;
      fileName: string;
      url: string;
    }>('/api/thumbnails/on-demand', {
      method: 'POST',
      body: JSON.stringify({
        videoId: video.id,
        fileName: `thumb-${video.id}.jpg`,
        mimeType: 'image/jpeg',
        base64Data,
      }),
    });
    return {
      fileName: response.fileName,
      url: response.url,
    };
  }

  /**
   * Admin manual thumbnail generation bypasses the 30-second queue delay and executes immediately.
   */
  public async generateAdminThumbnailNow(
    videoId?: string,
    folderId?: string
  ): Promise<{ generatedCount: number }> {
    const res = await apiWorkerPool.fetchApi<{
      generatedCount: number;
      generated: Array<{ videoId: string; fileName: string }>;
    }>('/api/admin/thumbnails/generate', {
      method: 'POST',
      body: JSON.stringify({ videoId, folderId }),
    });

    for (const item of res.generated || []) {
      this.completedSet.add(item.videoId);
      this.failedSet.delete(item.videoId);
      this.statusMap.set(item.videoId, 'Completed');
      this.pendingQueue = this.pendingQueue.filter((v) => v.id !== item.videoId);
    }
    this.notify();
    return { generatedCount: res.generatedCount };
  }

  private async captureBrowserFrameOrCanvas(video: VideoItem): Promise<string> {
    if (typeof document === 'undefined') {
      // Node.js unit test environment fallback
      return Buffer.from(`cinemega-thumb-${video.id}`).toString('base64');
    }

    return new Promise<string>((resolve) => {
      const renderFallbackCanvas = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const grad = ctx.createLinearGradient(0, 0, 640, 360);
          grad.addColorStop(0, '#0f0f13');
          grad.addColorStop(0.6, '#18181f');
          grad.addColorStop(1, '#291d0e');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 640, 360);

          ctx.fillStyle = '#f59e0b';
          ctx.font = '600 13px sans-serif';
          ctx.fillText('CINEMEGA · FRAME CAPTURE', 36, 68);

          ctx.fillStyle = '#f4f4f5';
          ctx.font = '700 24px sans-serif';
          ctx.fillText(video.title.slice(0, 34), 36, 280);

          ctx.fillStyle = '#a1a1aa';
          ctx.font = '400 13px monospace';
          ctx.fillText(`${video.extension.toUpperCase()} · ${video.id}`, 36, 310);
        }
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };

      try {
        const videoEl = document.createElement('video');
        videoEl.crossOrigin = 'anonymous';
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.preload = 'metadata';

        const timeout = setTimeout(() => {
          videoEl.src = '';
          renderFallbackCanvas();
        }, 4000);

        videoEl.onloadeddata = () => {
          videoEl.currentTime = Math.min(1.0, (videoEl.duration || 2) * 0.25);
        };

        videoEl.onseeked = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth || 640;
            canvas.height = videoEl.videoHeight || 360;
            const ctx = canvas.getContext('2d');
            if (ctx && videoEl.videoWidth > 0) {
              ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
              videoEl.src = '';
              resolve(dataUrl);
              return;
            }
          } catch {
            // fallback
          }
          videoEl.src = '';
          renderFallbackCanvas();
        };

        videoEl.onerror = () => {
          clearTimeout(timeout);
          renderFallbackCanvas();
        };

        videoEl.src = apiWorkerPool.getStreamUrlForVideo(video.id);
      } catch {
        renderFallbackCanvas();
      }
    });
  }

  public resetForTest(): void {
    this.pendingQueue = [];
    this.attemptedSet.clear();
    this.completedSet.clear();
    this.failedSet.clear();
    this.statusMap.clear();
    this.activeVideoId = null;
    this.isProcessing = false;
  }
}

// Singleton module-level instance
export const thumbnailQueue = new OnDemandThumbnailQueue();
