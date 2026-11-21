// ============================================================================
// CineMega — Global Library & Viewer Watch-State Context
// ============================================================================

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { LibraryFolder, VideoItem, ViewerWatchState } from '../types/cinemega';
import { apiWorkerPool } from '../utils/apiBase';
import {
  thumbnailQueue,
  type ThumbnailQueueSnapshot,
  type ThumbnailQueueStatus,
} from '../utils/thumbnailGenerator';

interface FlattenedVideoEntry {
  video: VideoItem;
  folder: LibraryFolder;
}

interface CineMegaContextValue {
  folders: LibraryFolder[];
  allVideos: FlattenedVideoEntry[];
  watchStates: Record<string, ViewerWatchState>;
  loading: boolean;
  error: string | null;
  queueSnapshot: ThumbnailQueueSnapshot;
  refreshLibrary: () => Promise<void>;
  toggleFavorite: (video: VideoItem) => Promise<void>;
  updateWatchProgress: (
    video: VideoItem,
    positionSec: number,
    durationSec: number
  ) => Promise<void>;
  removeWatchState: (videoId: string) => Promise<void>;
  getVideoById: (videoId: string) => FlattenedVideoEntry | null;
  getThumbnailStatus: (video: VideoItem) => ThumbnailQueueStatus;
}

const CineMegaContext = createContext<CineMegaContextValue | null>(null);

export const CineMegaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [watchStates, setWatchStates] = useState<Record<string, ViewerWatchState>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [queueSnapshot, setQueueSnapshot] = useState<ThumbnailQueueSnapshot>(
    thumbnailQueue.getSnapshot()
  );

  const refreshLibrary = useCallback(async () => {
    try {
      setError(null);
      const [foldersRes, watchRes] = await Promise.all([
        apiWorkerPool.fetchApi<{ folders: LibraryFolder[] }>('/api/folders'),
        apiWorkerPool.fetchApi<{ watchStates: ViewerWatchState[] }>('/api/watch-states'),
      ]);

      const loadedFolders = foldersRes.folders || [];
      setFolders(loadedFolders);

      const wsMap: Record<string, ViewerWatchState> = {};
      for (const ws of watchRes.watchStates || []) {
        wsMap[ws.videoId] = ws;
      }
      setWatchStates(wsMap);

      // Enqueue visible videos lacking thumbnails into the 30-second singleton queue
      const videosToQueue: VideoItem[] = [];
      for (const f of loadedFolders) {
        for (const v of f.videos) {
          if (!v.thumbnailFileName) {
            videosToQueue.push(v);
          }
        }
      }
      if (videosToQueue.length > 0) {
        thumbnailQueue.enqueueVideos(videosToQueue, (videoId, fileName) => {
          setFolders((prev) =>
            prev.map((folder) => ({
              ...folder,
              videos: folder.videos.map((v) =>
                v.id === videoId ? { ...v, thumbnailFileName: fileName } : v
              ),
            }))
          );
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load CineMega catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
    const unsubscribe = thumbnailQueue.subscribe((snap) => {
      setQueueSnapshot(snap);
    });
    return unsubscribe;
  }, [refreshLibrary]);

  const allVideos: FlattenedVideoEntry[] = React.useMemo(() => {
    const list: FlattenedVideoEntry[] = [];
    for (const folder of folders) {
      for (const video of folder.videos) {
        list.push({ video, folder });
      }
    }
    return list;
  }, [folders]);

  const getVideoById = useCallback(
    (videoId: string): FlattenedVideoEntry | null => {
      return allVideos.find((item) => item.video.id === videoId) || null;
    },
    [allVideos]
  );

  const toggleFavorite = useCallback(
    async (video: VideoItem) => {
      const current = watchStates[video.id];
      const nextFav = !current?.favorite;

      const optimistic: ViewerWatchState = {
        viewerKey: apiWorkerPool.getViewerKey(),
        videoId: video.id,
        folderId: video.folderId,
        positionSec: current?.positionSec || 0,
        durationSec: current?.durationSec || video.durationSec || 0,
        favorite: nextFav,
        updatedAt: Date.now(),
      };

      setWatchStates((prev) => ({
        ...prev,
        [video.id]: optimistic,
      }));

      try {
        const res = await apiWorkerPool.fetchApi<{ watchState: ViewerWatchState }>(
          `/api/watch-states/${encodeURIComponent(video.id)}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              folderId: video.folderId,
              positionSec: optimistic.positionSec,
              durationSec: optimistic.durationSec,
              favorite: nextFav,
            }),
          }
        );
        if (res.watchState) {
          setWatchStates((prev) => ({
            ...prev,
            [video.id]: res.watchState,
          }));
        }
      } catch {
        // revert on error
        void refreshLibrary();
      }
    },
    [watchStates, refreshLibrary]
  );

  const updateWatchProgress = useCallback(
    async (video: VideoItem, positionSec: number, durationSec: number) => {
      const current = watchStates[video.id];
      const optimistic: ViewerWatchState = {
        viewerKey: apiWorkerPool.getViewerKey(),
        videoId: video.id,
        folderId: video.folderId,
        positionSec,
        durationSec: durationSec || current?.durationSec || video.durationSec || 0,
        favorite: current?.favorite || false,
        updatedAt: Date.now(),
      };

      setWatchStates((prev) => ({
        ...prev,
        [video.id]: optimistic,
      }));

      try {
        await apiWorkerPool.fetchApi<{ watchState: ViewerWatchState }>(
          `/api/watch-states/${encodeURIComponent(video.id)}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              folderId: video.folderId,
              positionSec: optimistic.positionSec,
              durationSec: optimistic.durationSec,
              favorite: optimistic.favorite,
            }),
          }
        );
      } catch {
        // non-blocking
      }
    },
    [watchStates]
  );

  const removeWatchState = useCallback(async (videoId: string) => {
    setWatchStates((prev) => {
      const copy = { ...prev };
      delete copy[videoId];
      return copy;
    });
    try {
      await apiWorkerPool.fetchApi(`/api/watch-states/${encodeURIComponent(videoId)}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore
    }
  }, []);

  const getThumbnailStatus = useCallback(
    (video: VideoItem): ThumbnailQueueStatus => {
      if (video.thumbnailFileName) return 'Completed';
      return (
        queueSnapshot.statusByVideoId[video.id] ||
        thumbnailQueue.getStatusForVideo(video)
      );
    },
    [queueSnapshot]
  );

  return (
    <CineMegaContext.Provider
      value={{
        folders,
        allVideos,
        watchStates,
        loading,
        error,
        queueSnapshot,
        refreshLibrary,
        toggleFavorite,
        updateWatchProgress,
        removeWatchState,
        getVideoById,
        getThumbnailStatus,
      }}
    >
      {children}
    </CineMegaContext.Provider>
  );
};

export function useCineMega(): CineMegaContextValue {
  const ctx = useContext(CineMegaContext);
  if (!ctx) {
    throw new Error('useCineMega must be used within a CineMegaProvider');
  }
  return ctx;
}
