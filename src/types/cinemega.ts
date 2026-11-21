// ============================================================================
// CineMega — Shared TypeScript Domain & API Contracts
// ============================================================================

export type CinemaGenre =
  | 'Sci-Fi'
  | 'Documentary'
  | 'Action'
  | 'Noir & Mystery'
  | 'Animation'
  | 'Horror'
  | 'Comedy'
  | 'Drama & Indie'
  | string;

export interface VideoItem {
  id: string; // Opaque ID e.g. vid-a8f3k2m9p1q4
  folderId: string;
  title: string;
  rawFileName: string;
  cleanedFileName: string;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  durationSec?: number;
  nodeId: string;
  rootUrl: string;
  thumbnailFileName?: string;
  addedAt: number;
  episodeLabel?: string;
  demoStreamMode?: boolean;
}

export interface LibraryFolder {
  id: string;
  name: string;
  description: string;
  genre: CinemaGenre;
  megaUrl: string;
  sourceType: 'folder' | 'file';
  position: number;
  totalSizeBytes: number;
  videos: VideoItem[];
  createdAt: number;
  updatedAt: number;
}

export interface ViewerWatchState {
  viewerKey: string;
  videoId: string;
  folderId: string;
  positionSec: number;
  durationSec: number;
  favorite: boolean;
  updatedAt: number;
}

export interface InspectResult {
  cacheKey: string;
  folderName: string;
  suggestedGenre: CinemaGenre;
  sourceType: 'folder' | 'file';
  megaUrl: string;
  totalSizeBytes: number;
  videos: VideoItem[];
  cachedAt: number;
  expiresAt: number;
  fromCache?: boolean;
}

export interface WorkerHealthReport {
  platform: 'Cloudflare Workers' | 'Vercel Functions' | 'Netlify Functions' | 'Local Node.js';
  status: 'healthy' | 'degraded' | 'offline';
  database: {
    connected: boolean;
    mode: 'supabase-postgres' | 'shared-memory-fallback';
    latencyMs: number;
  };
  cache: {
    inspectEntries: number;
    streamBlocks: number;
    storageTickets: number;
    nodeKeys: number;
    thumbnails: number;
  };
  metrics: {
    uptimeSec: number;
    requestsHandled: number;
    memoryRssMb?: number;
  };
  timestamp: number;
}

export interface PlayedVideoStat {
  videoId: string;
  folderId: string;
  title: string;
  folderName: string;
  genre: string;
  views: number;
  watchTimeSec: number;
  lastPlayedAt: number;
}

export interface AdminStatsResponse {
  totalViews: number;
  totalWatchTimeSec: number;
  cacheHits: number;
  megaRequests: number;
  cachedBytesServed: number;
  topVideos: PlayedVideoStat[];
  recentVideos: PlayedVideoStat[];
  cacheStats: {
    inspectCount: number;
    streamBlockCount: number;
    streamBlockBytes: number;
    ticketCount: number;
    nodeKeyCount: number;
    thumbnailCount: number;
  };
  workerHealth: WorkerHealthReport;
}

export interface AdminUser {
  username: string;
  email: string;
  updatedAt: number;
  requiresSetup?: boolean;
}
