// ============================================================================
// CineMega — Distributed Frontend API Worker Pool & Failover Coordinator
// ============================================================================
// Supports single `VITE_API_BASE_URL` or multi-worker `VITE_WORKER_URLS`
// (Cloudflare Workers, Vercel Functions, Netlify Functions, Local Node.js).
// Implements health-aware round-robin selection, 30s cooldown on failures,
// automatic retry on network error / HTTP 429 / HTTP 5xx, and consistent
// session routing for video streaming with HTTP Range reliability.

import type { WorkerHealthReport } from '../types/cinemega';

export interface WorkerNodeState {
  id: string;
  baseUrl: string; // '' for current origin, or 'https://worker1.example.com'
  label: string;
  platformHint: string;
  healthy: boolean;
  cooldownUntil: number;
  consecutiveFailures: number;
  lastLatencyMs: number | null;
  lastCheckedAt: number | null;
  lastError: string | null;
  lastReport: WorkerHealthReport | null;
  requestsServed: number;
}

const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 18_000;

export class ApiWorkerPool {
  private workers: WorkerNodeState[] = [];
  private roundRobinIndex = 0;
  private streamWorkerAffinity = new Map<string, string>(); // videoId -> worker.id
  private adminTokenInMemory: string | null = null;
  private viewerKey: string = 'anon-viewer';

  constructor(config?: {
    apiBaseUrl?: string;
    workerUrlsCsv?: string;
  }) {
    this.initViewerKey();
    this.configureWorkers(config?.apiBaseUrl, config?.workerUrlsCsv);
  }

  private initViewerKey(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const existing = window.localStorage.getItem('cinemega_viewer_key');
        if (existing && existing.length >= 8) {
          this.viewerKey = existing;
          return;
        }
        const generated = `vw-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
        window.localStorage.setItem('cinemega_viewer_key', generated);
        this.viewerKey = generated;
      } catch {
        this.viewerKey = 'vw-session-ephemeral';
      }
    }
  }

  public getViewerKey(): string {
    return this.viewerKey;
  }

  public setAdminToken(token: string | null): void {
    this.adminTokenInMemory = token;
  }

  public getAdminToken(): string | null {
    return this.adminTokenInMemory;
  }

  public configureWorkers(apiBaseUrl?: string, workerUrlsCsv?: string): void {
    const envBase =
      apiBaseUrl !== undefined
        ? apiBaseUrl
        : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
    const envCsv =
      workerUrlsCsv !== undefined
        ? workerUrlsCsv
        : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WORKER_URLS) || '';

    const rawUrls: string[] = [];
    if (envCsv && envCsv.trim()) {
      for (const part of envCsv.split(',')) {
        const cleaned = part.trim().replace(/\/+$/, '');
        if (cleaned && !rawUrls.includes(cleaned)) {
          rawUrls.push(cleaned);
        }
      }
    }

    if (envBase && envBase.trim()) {
      const cleanedBase = envBase.trim().replace(/\/+$/, '');
      if (!rawUrls.includes(cleanedBase)) {
        rawUrls.unshift(cleanedBase);
      }
    }

    // Always include current-origin relative worker ('') as fallback or primary
    if (rawUrls.length === 0) {
      rawUrls.push('');
    }

    this.workers = rawUrls.map((baseUrl, index) => {
      let label = 'Primary Edge Node (Origin)';
      let platformHint = 'Auto-Detect';
      if (baseUrl.includes('workers.dev') || baseUrl.includes('cloudflare')) {
        label = `Cloudflare Worker #${index + 1}`;
        platformHint = 'Cloudflare Workers';
      } else if (baseUrl.includes('vercel.app')) {
        label = `Vercel Function #${index + 1}`;
        platformHint = 'Vercel Functions';
      } else if (baseUrl.includes('netlify.app')) {
        label = `Netlify Function #${index + 1}`;
        platformHint = 'Netlify Functions';
      } else if (baseUrl) {
        label = `Worker Node #${index + 1} (${baseUrl})`;
        platformHint = 'Distributed Node';
      }

      return {
        id: `worker-${index + 1}`,
        baseUrl,
        label,
        platformHint,
        healthy: true,
        cooldownUntil: 0,
        consecutiveFailures: 0,
        lastLatencyMs: null,
        lastCheckedAt: null,
        lastError: null,
        lastReport: null,
        requestsServed: 0,
      };
    });

    this.roundRobinIndex = 0;
  }

  public getWorkersSnapshot(): WorkerNodeState[] {
    const now = Date.now();
    // Auto-recover workers whose cooldown has expired
    for (const w of this.workers) {
      if (!w.healthy && w.cooldownUntil > 0 && now >= w.cooldownUntil) {
        w.healthy = true;
        w.cooldownUntil = 0;
      }
    }
    return this.workers.map((w) => ({ ...w }));
  }

  /**
   * Selects the next healthy worker using health-aware round-robin.
   * Never picks an unhealthy worker while healthy workers remain.
   */
  public selectHealthyWorker(excludeIds: Set<string> = new Set()): WorkerNodeState {
    const now = Date.now();
    for (const w of this.workers) {
      if (!w.healthy && w.cooldownUntil > 0 && now >= w.cooldownUntil) {
        w.healthy = true;
        w.cooldownUntil = 0;
      }
    }

    const total = this.workers.length;
    for (let i = 0; i < total; i++) {
      const idx = (this.roundRobinIndex + i) % total;
      const candidate = this.workers[idx];
      if (candidate.healthy && !excludeIds.has(candidate.id)) {
        this.roundRobinIndex = (idx + 1) % total;
        return candidate;
      }
    }

    // If all healthy workers were excluded or all are in cooldown, pick the one with shortest remaining cooldown
    const available = this.workers.filter((w) => !excludeIds.has(w.id));
    const pool = available.length > 0 ? available : this.workers;
    const best = [...pool].sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
    return best;
  }

  /**
   * Marks a worker as unhealthy and puts it into temporary cooldown.
   */
  public markWorkerFailure(
    workerId: string,
    errorReason: string,
    cooldownMs = DEFAULT_COOLDOWN_MS
  ): void {
    const w = this.workers.find((item) => item.id === workerId);
    if (!w) return;
    w.consecutiveFailures += 1;
    w.healthy = false;
    w.cooldownUntil = Date.now() + cooldownMs;
    w.lastError = errorReason;
    w.lastCheckedAt = Date.now();
  }

  /**
   * Marks a worker as healthy after a successful response.
   */
  public markWorkerSuccess(
    workerId: string,
    latencyMs: number,
    report?: WorkerHealthReport
  ): void {
    const w = this.workers.find((item) => item.id === workerId);
    if (!w) return;
    w.healthy = true;
    w.cooldownUntil = 0;
    w.consecutiveFailures = 0;
    w.lastLatencyMs = latencyMs;
    w.lastCheckedAt = Date.now();
    w.lastError = null;
    w.requestsServed += 1;
    if (report) {
      w.lastReport = report;
      w.platformHint = report.platform;
    }
  }

  /**
   * Builds a stream URL for a video using consistent session affinity so the same video
   * session does not unnecessarily jump between workers unless the worker becomes unhealthy.
   */
  public getStreamUrlForVideo(videoId: string): string {
    const now = Date.now();
    const affinityWorkerId = this.streamWorkerAffinity.get(videoId);
    if (affinityWorkerId) {
      const existing = this.workers.find((w) => w.id === affinityWorkerId);
      if (existing && (existing.healthy || now >= existing.cooldownUntil)) {
        return `${existing.baseUrl}/api/mega/stream?videoId=${encodeURIComponent(videoId)}`;
      }
    }

    const selected = this.selectHealthyWorker();
    this.streamWorkerAffinity.set(videoId, selected.id);
    return `${selected.baseUrl}/api/mega/stream?videoId=${encodeURIComponent(videoId)}`;
  }

  /**
   * Resolves a thumbnail URL against the healthiest worker.
   */
  public getThumbnailUrl(fileName: string): string {
    const selected = this.selectHealthyWorker();
    return `${selected.baseUrl}/api/thumbnails/${encodeURIComponent(fileName)}`;
  }

  /**
   * Executes an HTTP API request across the worker pool with automatic failover
   * on network failure, timeout, HTTP 429, or HTTP 5xx.
   */
  public async fetchApi<T = unknown>(
    path: string,
    options: RequestInit & { timeoutMs?: number } = {},
    customFetch: typeof fetch = fetch
  ): Promise<T> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const timeoutMs = options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
    const maxAttempts = Math.max(2, this.workers.length);
    const triedWorkerIds = new Set<string>();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const worker = this.selectHealthyWorker(triedWorkerIds);
      triedWorkerIds.add(worker.id);

      const fullUrl = `${worker.baseUrl}${normalizedPath}`;
      const startTime = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers = new Headers(options.headers || {});
        if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
          headers.set('Content-Type', 'application/json');
        }
        headers.set('X-Viewer-Key', this.viewerKey);
        if (this.adminTokenInMemory && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${this.adminTokenInMemory}`);
        }

        const response = await customFetch(fullUrl, {
          ...options,
          headers,
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timer);

        const latencyMs = Math.max(1, Date.now() - startTime);

        // Retry on 429 Too Many Requests or 5xx Server Errors
        if (response.status === 429 || response.status >= 500) {
          let errMsg = `HTTP ${response.status}`;
          try {
            const errJson = await response.clone().json();
            if (errJson?.error) errMsg = errJson.error;
          } catch {
            // ignore
          }
          this.markWorkerFailure(worker.id, errMsg);
          lastError = new Error(errMsg);
          if (attempt < maxAttempts - 1 && this.workers.length > 1) {
            continue;
          }
          throw lastError;
        }

        this.markWorkerSuccess(worker.id, latencyMs);

        if (!response.ok) {
          let clientErrMsg = `Request failed (${response.status})`;
          try {
            const errJson = await response.json();
            if (errJson?.error) clientErrMsg = errJson.error;
          } catch {
            // ignore
          }
          throw new Error(clientErrMsg);
        }

        const data = (await response.json()) as T;
        return data;
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const message = isAbort
          ? `Worker request timed out after ${timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : 'Network error';

        // Only mark worker unhealthy on network/timeout/5xx errors, not 400/401/404 validation errors
        if (
          isAbort ||
          message.includes('Failed to fetch') ||
          message.includes('Network') ||
          message.includes('ECONN')
        ) {
          this.markWorkerFailure(worker.id, message);
          lastError = new Error(message);
          if (attempt < maxAttempts - 1) {
            continue;
          }
        }
        throw err instanceof Error ? err : new Error(message);
      }
    }

    throw lastError || new Error('All API workers failed to respond.');
  }

  /**
   * Probes `/api/health` on all configured workers and updates their live telemetry.
   */
  public async refreshAllWorkersHealth(
    customFetch: typeof fetch = fetch
  ): Promise<WorkerNodeState[]> {
    await Promise.all(
      this.workers.map(async (worker) => {
        const start = Date.now();
        try {
          const res = await customFetch(`${worker.baseUrl}/api/health`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          const latencyMs = Math.max(1, Date.now() - start);
          if (!res.ok) {
            this.markWorkerFailure(worker.id, `Health probe HTTP ${res.status}`);
            return;
          }
          const report = (await res.json()) as WorkerHealthReport;
          this.markWorkerSuccess(worker.id, latencyMs, report);
        } catch (err) {
          this.markWorkerFailure(
            worker.id,
            err instanceof Error ? err.message : 'Health probe failed'
          );
        }
      })
    );

    return this.getWorkersSnapshot();
  }
}

export const apiWorkerPool = new ApiWorkerPool();
