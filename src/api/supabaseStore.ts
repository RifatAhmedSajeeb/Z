// ============================================================================
// CineMega — Unified Supabase PostgreSQL & Shared Cache Storage Engine
// ============================================================================
// Strictly uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend.
// Never exposes service-role credentials to the frontend.
// Automatically falls back to an isomorphic in-memory store with rich seeded
// cinema catalog data when SUPABASE_URL is not configured in local preview.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  InspectResult,
  LibraryFolder,
  PlayedVideoStat,
  ViewerWatchState,
} from '../types/cinemega';
import { generateOpaqueVideoId } from './megaUtils';

export interface StoredThumbnail {
  fileName: string;
  videoId: string;
  mimeType: string;
  base64Data: string;
  updatedAt: number;
}

export interface StoredStreamBlock {
  blockKey: string;
  streamKey: string;
  blockIndex: number;
  dataBase64: string;
  sizeBytes: number;
  updatedAt: number;
  expiresAt: number;
}

export interface StoredMegaNodeKey {
  nodeCacheKey: string;
  rootUrl: string;
  nodeId: string;
  fileName: string;
  sizeBytes: number;
  keyB64: string;
  downloadIdJson: unknown;
  updatedAt: number;
  expiresAt: number;
}

export interface StoredMegaTicket {
  streamKey: string;
  cdnUrl: string;
  sizeBytes: number;
  keyB64: string;
  strategyUsed: string;
  updatedAt: number;
  expiresAt: number;
}

export interface StoredAdminConfig {
  id: 1;
  username: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  updatedAt: number;
}

export interface StoredAnalyticsState {
  totalViews: number;
  totalWatchTimeSec: number;
  cacheHits: number;
  megaRequests: number;
  cachedBytesServed: number;
}

export interface EnvVars {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SESSION_SECRET?: string;
  ADMIN_PASSCODE?: string;
  ADMIN_INITIAL_USERNAME?: string;
  ADMIN_INITIAL_EMAIL?: string;
  ALLOWED_ORIGINS?: string;
  INSPECT_CACHE_TTL_MS?: string;
  TICKET_CACHE_TTL_MS?: string;
  STREAM_BLOCK_CACHE_LIMIT_MB?: string;
  MEGA_GATEWAY_TIMEOUT_MS?: string;
}

// Seeded Initial Cinema Folders so the preview works out-of-the-box with realistic data
function createSeededFolders(): LibraryFolder[] {
  const now = Date.now();
  const folder1Url = 'https://mega.nz/folder/AbCdEfGh#KlMnOpQrStUvWxYz123456';
  const folder2Url = 'https://mega.nz/folder/ZyXwVuTs#RqPoNmLkJiHgFeDc654321';
  const folder3Url = 'https://mega.nz/folder/NoIrMySt#ShAdOwCiPhErKeY9876543';
  const folder4Url = 'https://mega.nz/folder/DoCuArCh#NaTuReChRoNiClE4567890';
  const folder5Url = 'https://mega.nz/folder/AnImStUd#CeLsHaDeDmEcHa11223344';

  const folders: LibraryFolder[] = [
    {
      id: 'fld-solaris-odyssey',
      name: 'Solaris Orbital Archives',
      description: 'Deep-space sci-fi anthology shot in anamorphic 65mm, exploring orbital stations, silence, and first-contact telemetry.',
      genre: 'Sci-Fi',
      megaUrl: folder1Url,
      sourceType: 'folder',
      position: 0,
      totalSizeBytes: 4_820_000_000,
      createdAt: now - 86400000 * 5,
      updatedAt: now - 3600000 * 4,
      videos: [
        {
          id: generateOpaqueVideoId(folder1Url, 'node-solaris-01'),
          folderId: 'fld-solaris-odyssey',
          title: 'Horizon of the Lagrange Point (2026)',
          rawFileName: 'Horizon.of.the.Lagrange.Point.2026.S01E01.2160p.WEB-DL.x265.HEVC-CINEMEGA.mp4',
          cleanedFileName: 'Horizon of the Lagrange Point (2026)',
          episodeLabel: 'S01E01',
          sizeBytes: 1_840_000_000,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: 3420,
          nodeId: 'node-solaris-01',
          rootUrl: folder1Url,
          addedAt: now - 86400000 * 5,
          demoStreamMode: true,
        },
        {
          id: generateOpaqueVideoId(folder1Url, 'node-solaris-02'),
          folderId: 'fld-solaris-odyssey',
          title: 'Cryogenic Drift Protocol (2026)',
          rawFileName: 'Cryogenic.Drift.Protocol.2026.S01E02.1080p.BluRay.x264.AAC.mp4',
          cleanedFileName: 'Cryogenic Drift Protocol (2026)',
          episodeLabel: 'S01E02',
          sizeBytes: 1_520_000_000,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: 2980,
          nodeId: 'node-solaris-02',
          rootUrl: folder1Url,
          addedAt: now - 86400000 * 4,
          demoStreamMode: true,
        },
        {
          id: generateOpaqueVideoId(folder1Url, 'node-solaris-03'),
          folderId: 'fld-solaris-odyssey',
          title: 'Perigee Signal Transmission (2026)',
          rawFileName: 'Perigee.Signal.Transmission.2026.S01E03.1080p.WEB-DL.HEVC.mkv',
          cleanedFileName: 'Perigee Signal Transmission (2026)',
          episodeLabel: 'S01E03',
          sizeBytes: 1_460_000_000,
          mimeType: 'video/x-matroska',
          extension: 'mkv',
          durationSec: 3150,
          nodeId: 'node-solaris-03',
          rootUrl: folder1Url,
          addedAt: now - 86400000 * 3,
          demoStreamMode: true,
        },
      ],
    },
    {
      id: 'fld-midnight-cipher',
      name: 'Midnight Cipher & Rain',
      description: 'Neo-noir thrillers set across rain-slicked European transit hubs, analog tape vaults, and encrypted diplomatic couriers.',
      genre: 'Noir & Mystery',
      megaUrl: folder3Url,
      sourceType: 'folder',
      position: 1,
      totalSizeBytes: 3_650_000_000,
      createdAt: now - 86400000 * 4,
      updatedAt: now - 3600000 * 8,
      videos: [
        {
          id: generateOpaqueVideoId(folder3Url, 'node-noir-01'),
          folderId: 'fld-midnight-cipher',
          title: 'The Zurich Dead Drop (2025)',
          rawFileName: '[CinemaVault] The_Zurich_Dead_Drop_2025_1080p_BluRay_x265_10bit.mp4',
          cleanedFileName: 'The Zurich Dead Drop (2025)',
          sizeBytes: 1_950_000_000,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: 5840,
          nodeId: 'node-noir-01',
          rootUrl: folder3Url,
          addedAt: now - 86400000 * 4,
          demoStreamMode: true,
        },
        {
          id: generateOpaqueVideoId(folder3Url, 'node-noir-02'),
          folderId: 'fld-midnight-cipher',
          title: 'Glass Harbor Testimony (2025)',
          rawFileName: 'Glass.Harbor.Testimony.2025.1080p.WEBRip.x264.mp4',
          cleanedFileName: 'Glass Harbor Testimony (2025)',
          sizeBytes: 1_700_000_000,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: 5120,
          nodeId: 'node-noir-02',
          rootUrl: folder3Url,
          addedAt: now - 86400000 * 3,
          demoStreamMode: true,
        },
      ],
    },
    {
      id: 'fld-polar-expedition',
      name: 'Svalbard Glacial Chronicles',
      description: 'High-latitude acoustic and aerial cinematography documenting sub-zero research vessels and deep-ice core drilling.',
      genre: 'Documentary',
      megaUrl: folder4Url,
      sourceType: 'folder',
      position: 2,
      totalSizeBytes: 2_980_000_000,
      createdAt: now - 86400000 * 3,
      updatedAt: now - 3600000 * 12,
      videos: [
        {
          id: generateOpaqueVideoId(folder4Url, 'node-doc-01'),
          folderId: 'fld-polar-expedition',
          title: 'Beneath the Eightieth Parallel (2026)',
          rawFileName: 'Beneath_the_Eightieth_Parallel_2026_S01E01_2160p_UHD_WEB-DL_x265.mp4',
          cleanedFileName: 'Beneath the Eightieth Parallel (2026)',
          episodeLabel: 'S01E01',
          sizeBytes: 1_620_000_000,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: 2740,
          nodeId: 'node-doc-01',
          rootUrl: folder4Url,
          addedAt: now - 86400000 * 3,
          demoStreamMode: true,
        },
        {
          id: generateOpaqueVideoId(folder4Url, 'node-doc-02'),
          folderId: 'fld-polar-expedition',
          title: 'Acoustic Echoes of the Fjord (2026)',
          rawFileName: 'Acoustic_Echoes_of_the_Fjord_2026_S01E02_1080p_WEB-DL.mp4',
          cleanedFileName: 'Acoustic Echoes of the Fjord (2026)',
          episodeLabel: 'S01E02',
          sizeBytes: 1_360_000_000,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: 2560,
          nodeId: 'node-doc-02',
          rootUrl: folder4Url,
          addedAt: now - 86400000 * 2,
          demoStreamMode: true,
        },
      ],
    },
    {
      id: 'fld-apex-velocity',
      name: 'Apex Turbine & Circuit',
      description: 'High-frame-rate endurance motorsport and aerial pursuit stunt reels captured on custom gyro-stabilized rigs.',
      genre: 'Action',
      megaUrl: folder2Url,
      sourceType: 'folder',
      position: 3,
      totalSizeBytes: 2_450_000_000,
      createdAt: now - 86400000 * 2,
      updatedAt: now - 3600000 * 6,
      videos: [
        {
          id: generateOpaqueVideoId(folder2Url, 'node-act-01'),
          folderId: 'fld-apex-velocity',
          title: 'Nürburgring Night Stint (2026)',
          rawFileName: 'Nurburgring.Night.Stint.2026.1080p.WEB-DL.H264.mp4',
          cleanedFileName: 'Nürburgring Night Stint (2026)',
          sizeBytes: 2_450_000_000,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: 4180,
          nodeId: 'node-act-01',
          rootUrl: folder2Url,
          addedAt: now - 86400000 * 2,
          demoStreamMode: true,
        },
      ],
    },
    {
      id: 'fld-cel-automata',
      name: 'Clockwork Automata Studio',
      description: 'Hand-painted background layouts combined with kinetic mechanical animation studies.',
      genre: 'Animation',
      megaUrl: folder5Url,
      sourceType: 'folder',
      position: 4,
      totalSizeBytes: 1_890_000_000,
      createdAt: now - 86400000,
      updatedAt: now - 3600000 * 2,
      videos: [
        {
          id: generateOpaqueVideoId(folder5Url, 'node-anim-01'),
          folderId: 'fld-cel-automata',
          title: 'The Brass Observatory (2026)',
          rawFileName: '[StudioCel] The_Brass_Observatory_2026_1080p_BluRay_FLAC.mp4',
          cleanedFileName: 'The Brass Observatory (2026)',
          sizeBytes: 1_890_000_000,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: 1940,
          nodeId: 'node-anim-01',
          rootUrl: folder5Url,
          addedAt: now - 86400000,
          demoStreamMode: true,
        },
      ],
    },
  ];

  return folders;
}

// Singleton in-memory fallback & hot cache state
class MemoryDatabaseState {
  libraryMeta = new Map<string, string>();
  libraryFolders = new Map<string, LibraryFolder>();
  videoThumbnails = new Map<string, StoredThumbnail>();
  inspectCache = new Map<string, InspectResult>();
  streamBlocks = new Map<string, StoredStreamBlock>();
  megaNodeKeys = new Map<string, StoredMegaNodeKey>();
  megaStorageTickets = new Map<string, StoredMegaTicket>();
  analyticsState: StoredAnalyticsState = {
    totalViews: 142,
    totalWatchTimeSec: 68420,
    cacheHits: 389,
    megaRequests: 47,
    cachedBytesServed: 842_000_000,
  };
  playedVideos = new Map<string, PlayedVideoStat>();
  adminConfig: StoredAdminConfig | null = null;
  viewerWatchStates = new Map<string, ViewerWatchState>(); // key: `${viewerKey}::${videoId}`

  constructor() {
    const seeded = createSeededFolders();
    for (const folder of seeded) {
      this.libraryFolders.set(folder.id, folder);
    }

    // Seed initial played video stats so analytics dashboard has realistic history
    const firstVideo = seeded[0]?.videos[0];
    const secondVideo = seeded[1]?.videos[0];
    const thirdVideo = seeded[2]?.videos[0];
    if (firstVideo) {
      this.playedVideos.set(firstVideo.id, {
        videoId: firstVideo.id,
        folderId: firstVideo.folderId,
        title: firstVideo.title,
        folderName: seeded[0].name,
        genre: seeded[0].genre,
        views: 64,
        watchTimeSec: 31200,
        lastPlayedAt: Date.now() - 1800_000,
      });
    }
    if (secondVideo) {
      this.playedVideos.set(secondVideo.id, {
        videoId: secondVideo.id,
        folderId: secondVideo.folderId,
        title: secondVideo.title,
        folderName: seeded[1].name,
        genre: seeded[1].genre,
        views: 48,
        watchTimeSec: 22400,
        lastPlayedAt: Date.now() - 7200_000,
      });
    }
    if (thirdVideo) {
      this.playedVideos.set(thirdVideo.id, {
        videoId: thirdVideo.id,
        folderId: thirdVideo.folderId,
        title: thirdVideo.title,
        folderName: seeded[2].name,
        genre: seeded[2].genre,
        views: 30,
        watchTimeSec: 14820,
        lastPlayedAt: Date.now() - 14400_000,
      });
    }
  }
}

const memStore = new MemoryDatabaseState();

export class CineMegaDatabase {
  private supabase: SupabaseClient | null = null;
  private maxStreamCacheBytes: number;

  constructor(env?: EnvVars) {
    const supabaseUrl = env?.SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseServiceKey =
      env?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const limitMb = parseInt(
      env?.STREAM_BLOCK_CACHE_LIMIT_MB || process.env.STREAM_BLOCK_CACHE_LIMIT_MB || '256',
      10
    );
    this.maxStreamCacheBytes = (isNaN(limitMb) || limitMb <= 0 ? 256 : limitMb) * 1024 * 1024;

    if (
      supabaseUrl &&
      supabaseServiceKey &&
      supabaseUrl.startsWith('http') &&
      supabaseServiceKey.length > 20
    ) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      } catch {
        this.supabase = null;
      }
    }
  }

  public isSupabaseConfigured(): boolean {
    return this.supabase !== null;
  }

  public async checkConnectivity(): Promise<{
    connected: boolean;
    mode: 'supabase-postgres' | 'shared-memory-fallback';
    latencyMs: number;
  }> {
    const start = Date.now();
    if (!this.supabase) {
      return {
        connected: true,
        mode: 'shared-memory-fallback',
        latencyMs: Math.max(1, Date.now() - start),
      };
    }

    try {
      const { error } = await this.supabase
        .from('library_meta')
        .select('key')
        .limit(1);
      if (error) {
        return {
          connected: false,
          mode: 'supabase-postgres',
          latencyMs: Date.now() - start,
        };
      }
      return {
        connected: true,
        mode: 'supabase-postgres',
        latencyMs: Math.max(1, Date.now() - start),
      };
    } catch {
      return {
        connected: false,
        mode: 'supabase-postgres',
        latencyMs: Date.now() - start,
      };
    }
  }

  // ==========================================================================
  // 1. library_folders
  // ==========================================================================
  public async getLibraryFolders(): Promise<LibraryFolder[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('library_folders')
        .select('folder_id, position, folder_json, updated_at')
        .order('position', { ascending: true });

      if (!error && data) {
        if (data.length === 0 && memStore.libraryFolders.size > 0) {
          // Seed initial folders into Supabase on first empty read
          const initial = Array.from(memStore.libraryFolders.values());
          for (const f of initial) {
            await this.upsertLibraryFolder(f);
          }
          return initial.sort((a, b) => a.position - b.position);
        }
        return data.map((row) => ({
          ...(row.folder_json as LibraryFolder),
          id: row.folder_id,
          position: row.position,
          updatedAt: Number(row.updated_at),
        }));
      }
    }

    return Array.from(memStore.libraryFolders.values()).sort(
      (a, b) => a.position - b.position
    );
  }

  public async getLibraryFolderById(folderId: string): Promise<LibraryFolder | null> {
    const folders = await this.getLibraryFolders();
    return folders.find((f) => f.id === folderId) || null;
  }

  public async upsertLibraryFolder(folder: LibraryFolder): Promise<LibraryFolder> {
    const updated: LibraryFolder = {
      ...folder,
      updatedAt: Date.now(),
    };
    memStore.libraryFolders.set(updated.id, updated);

    if (this.supabase) {
      await this.supabase.from('library_folders').upsert({
        folder_id: updated.id,
        position: updated.position,
        folder_json: updated,
        updated_at: updated.updatedAt,
      });
    }
    return updated;
  }

  public async deleteLibraryFolder(folderId: string): Promise<boolean> {
    const existing = await this.getLibraryFolderById(folderId);
    memStore.libraryFolders.delete(folderId);

    // Clean up associated thumbnails & watch states
    if (existing) {
      for (const vid of existing.videos) {
        for (const [fn, thumb] of memStore.videoThumbnails.entries()) {
          if (thumb.videoId === vid.id || fn === vid.thumbnailFileName) {
            memStore.videoThumbnails.delete(fn);
          }
        }
      }
    }
    for (const [key, ws] of memStore.viewerWatchStates.entries()) {
      if (ws.folderId === folderId) {
        memStore.viewerWatchStates.delete(key);
      }
    }

    if (this.supabase) {
      await this.supabase.from('library_folders').delete().eq('folder_id', folderId);
      await this.supabase.from('viewer_watch_states').delete().eq('folder_id', folderId);
      if (existing) {
        const videoIds = existing.videos.map((v) => v.id);
        if (videoIds.length > 0) {
          await this.supabase.from('video_thumbnails').delete().in('video_id', videoIds);
        }
      }
    }
    return true;
  }

  // ==========================================================================
  // 2. video_thumbnails
  // ==========================================================================
  public async getThumbnail(fileName: string): Promise<StoredThumbnail | null> {
    const mem = memStore.videoThumbnails.get(fileName);
    if (mem) return mem;

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('video_thumbnails')
        .select('*')
        .eq('file_name', fileName)
        .maybeSingle();

      if (!error && data) {
        const thumb: StoredThumbnail = {
          fileName: data.file_name,
          videoId: data.video_id,
          mimeType: data.mime_type,
          base64Data: data.base64_data,
          updatedAt: Number(data.updated_at),
        };
        memStore.videoThumbnails.set(fileName, thumb);
        return thumb;
      }
    }
    return null;
  }

  public async saveThumbnail(thumb: StoredThumbnail): Promise<void> {
    memStore.videoThumbnails.set(thumb.fileName, thumb);

    // Attach thumbnailFileName to matching video in libraryFolders
    const folders = await this.getLibraryFolders();
    for (const folder of folders) {
      let modified = false;
      const updatedVideos = folder.videos.map((v) => {
        if (v.id === thumb.videoId && v.thumbnailFileName !== thumb.fileName) {
          modified = true;
          return { ...v, thumbnailFileName: thumb.fileName };
        }
        return v;
      });
      if (modified) {
        await this.upsertLibraryFolder({ ...folder, videos: updatedVideos });
      }
    }

    if (this.supabase) {
      await this.supabase.from('video_thumbnails').upsert({
        file_name: thumb.fileName,
        video_id: thumb.videoId,
        mime_type: thumb.mimeType,
        base64_data: thumb.base64Data,
        updated_at: thumb.updatedAt,
      });
    }
  }

  // ==========================================================================
  // 3. inspect_cache
  // ==========================================================================
  public async getInspectCache(cacheKey: string): Promise<InspectResult | null> {
    const now = Date.now();
    const mem = memStore.inspectCache.get(cacheKey);
    if (mem) {
      if (mem.expiresAt > now) {
        return { ...mem, fromCache: true };
      }
      memStore.inspectCache.delete(cacheKey);
    }

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('inspect_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .maybeSingle();

      if (!error && data) {
        const expiresAt = Number(data.expires_at);
        if (expiresAt > now) {
          const entry: InspectResult = {
            cacheKey: data.cache_key,
            folderName: data.folder_name,
            suggestedGenre: data.suggested_genre,
            sourceType: data.source_type as 'folder' | 'file',
            megaUrl: data.mega_url,
            totalSizeBytes: Number(data.total_size_bytes),
            videos: data.videos_json,
            cachedAt: Number(data.cached_at),
            expiresAt,
            fromCache: true,
          };
          memStore.inspectCache.set(cacheKey, entry);
          return entry;
        } else {
          await this.supabase.from('inspect_cache').delete().eq('cache_key', cacheKey);
        }
      }
    }
    return null;
  }

  public async setInspectCache(entry: InspectResult): Promise<void> {
    memStore.inspectCache.set(entry.cacheKey, entry);

    if (this.supabase) {
      await this.supabase.from('inspect_cache').upsert({
        cache_key: entry.cacheKey,
        folder_name: entry.folderName,
        suggested_genre: entry.suggestedGenre,
        source_type: entry.sourceType,
        mega_url: entry.megaUrl,
        total_size_bytes: entry.totalSizeBytes,
        videos_json: entry.videos,
        cached_at: entry.cachedAt,
        expires_at: entry.expiresAt,
      });
    }
  }

  // ==========================================================================
  // 4. mega_node_keys & mega_storage_tickets & stream_blocks
  // ==========================================================================
  public async getMegaNodeKey(nodeCacheKey: string): Promise<StoredMegaNodeKey | null> {
    const now = Date.now();
    const mem = memStore.megaNodeKeys.get(nodeCacheKey);
    if (mem && mem.expiresAt > now) return mem;

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('mega_node_keys')
        .select('*')
        .eq('node_cache_key', nodeCacheKey)
        .maybeSingle();

      if (!error && data && Number(data.expires_at) > now) {
        const entry: StoredMegaNodeKey = {
          nodeCacheKey: data.node_cache_key,
          rootUrl: data.root_url,
          nodeId: data.node_id,
          fileName: data.file_name,
          sizeBytes: Number(data.size_bytes),
          keyB64: data.key_b64,
          downloadIdJson: data.download_id_json,
          updatedAt: Number(data.updated_at),
          expiresAt: Number(data.expires_at),
        };
        memStore.megaNodeKeys.set(nodeCacheKey, entry);
        return entry;
      }
    }
    return null;
  }

  public async setMegaNodeKey(entry: StoredMegaNodeKey): Promise<void> {
    memStore.megaNodeKeys.set(entry.nodeCacheKey, entry);
    if (this.supabase) {
      await this.supabase.from('mega_node_keys').upsert({
        node_cache_key: entry.nodeCacheKey,
        root_url: entry.rootUrl,
        node_id: entry.nodeId,
        file_name: entry.fileName,
        size_bytes: entry.sizeBytes,
        key_b64: entry.keyB64,
        download_id_json: entry.downloadIdJson,
        updated_at: entry.updatedAt,
        expires_at: entry.expiresAt,
      });
    }
  }

  public async getMegaTicket(streamKey: string): Promise<StoredMegaTicket | null> {
    const now = Date.now();
    const mem = memStore.megaStorageTickets.get(streamKey);
    if (mem && mem.expiresAt > now) return mem;

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('mega_storage_tickets')
        .select('*')
        .eq('stream_key', streamKey)
        .maybeSingle();

      if (!error && data && Number(data.expires_at) > now) {
        const ticket: StoredMegaTicket = {
          streamKey: data.stream_key,
          cdnUrl: data.cdn_url,
          sizeBytes: Number(data.size_bytes),
          keyB64: data.key_b64,
          strategyUsed: data.strategy_used,
          updatedAt: Number(data.updated_at),
          expiresAt: Number(data.expires_at),
        };
        memStore.megaStorageTickets.set(streamKey, ticket);
        return ticket;
      }
    }
    return null;
  }

  public async setMegaTicket(ticket: StoredMegaTicket): Promise<void> {
    memStore.megaStorageTickets.set(ticket.streamKey, ticket);
    if (this.supabase) {
      await this.supabase.from('mega_storage_tickets').upsert({
        stream_key: ticket.streamKey,
        cdn_url: ticket.cdnUrl,
        size_bytes: ticket.sizeBytes,
        key_b64: ticket.keyB64,
        strategy_used: ticket.strategyUsed,
        updated_at: ticket.updatedAt,
        expires_at: ticket.expiresAt,
      });
    }
  }

  public async getStreamBlock(blockKey: string): Promise<Buffer | null> {
    const now = Date.now();
    const mem = memStore.streamBlocks.get(blockKey);
    if (mem) {
      if (mem.expiresAt > now) {
        mem.updatedAt = now;
        return Buffer.from(mem.dataBase64, 'base64');
      }
      memStore.streamBlocks.delete(blockKey);
    }

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('stream_blocks')
        .select('*')
        .eq('block_key', blockKey)
        .maybeSingle();

      if (!error && data && Number(data.expires_at) > now) {
        const block: StoredStreamBlock = {
          blockKey: data.block_key,
          streamKey: data.stream_key,
          blockIndex: data.block_index,
          dataBase64: data.data_base64,
          sizeBytes: data.size_bytes,
          updatedAt: now,
          expiresAt: Number(data.expires_at),
        };
        memStore.streamBlocks.set(blockKey, block);
        return Buffer.from(block.dataBase64, 'base64');
      }
    }
    return null;
  }

  public async setStreamBlock(
    blockKey: string,
    streamKey: string,
    blockIndex: number,
    data: Buffer,
    ttlMs = 3600_000
  ): Promise<void> {
    const now = Date.now();
    const entry: StoredStreamBlock = {
      blockKey,
      streamKey,
      blockIndex,
      dataBase64: data.toString('base64'),
      sizeBytes: data.length,
      updatedAt: now,
      expiresAt: now + ttlMs,
    };

    // Enforce LRU eviction against maxStreamCacheBytes
    let currentBytes = 0;
    for (const b of memStore.streamBlocks.values()) {
      currentBytes += b.sizeBytes;
    }
    if (currentBytes + entry.sizeBytes > this.maxStreamCacheBytes) {
      const sorted = Array.from(memStore.streamBlocks.values()).sort(
        (a, b) => a.updatedAt - b.updatedAt
      );
      for (const candidate of sorted) {
        memStore.streamBlocks.delete(candidate.blockKey);
        currentBytes -= candidate.sizeBytes;
        if (currentBytes + entry.sizeBytes <= this.maxStreamCacheBytes * 0.85) {
          break;
        }
      }
    }

    memStore.streamBlocks.set(blockKey, entry);

    if (this.supabase) {
      await this.supabase.from('stream_blocks').upsert({
        block_key: entry.blockKey,
        stream_key: entry.streamKey,
        block_index: entry.blockIndex,
        data_base64: entry.dataBase64,
        size_bytes: entry.sizeBytes,
        updated_at: entry.updatedAt,
        expires_at: entry.expiresAt,
      });
    }
  }

  // ==========================================================================
  // 5. viewer_watch_states
  // ==========================================================================
  public async getViewerWatchStates(viewerKey: string): Promise<ViewerWatchState[]> {
    if (!viewerKey) return [];
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('viewer_watch_states')
        .select('*')
        .eq('viewer_key', viewerKey)
        .order('updated_at', { ascending: false });

      if (!error && data) {
        return data.map((row) => ({
          viewerKey: row.viewer_key,
          videoId: row.video_id,
          folderId: row.folder_id,
          positionSec: Number(row.position_sec),
          durationSec: Number(row.duration_sec),
          favorite: Boolean(row.favorite),
          updatedAt: Number(row.updated_at),
        }));
      }
    }

    const result: ViewerWatchState[] = [];
    for (const ws of memStore.viewerWatchStates.values()) {
      if (ws.viewerKey === viewerKey) {
        result.push(ws);
      }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async upsertViewerWatchState(state: ViewerWatchState): Promise<ViewerWatchState> {
    const key = `${state.viewerKey}::${state.videoId}`;
    const existing = memStore.viewerWatchStates.get(key);
    const merged: ViewerWatchState = {
      viewerKey: state.viewerKey,
      videoId: state.videoId,
      folderId: state.folderId || existing?.folderId || 'unknown',
      positionSec:
        typeof state.positionSec === 'number'
          ? state.positionSec
          : existing?.positionSec || 0,
      durationSec:
        typeof state.durationSec === 'number'
          ? state.durationSec
          : existing?.durationSec || 0,
      favorite:
        typeof state.favorite === 'boolean'
          ? state.favorite
          : existing?.favorite || false,
      updatedAt: Date.now(),
    };
    memStore.viewerWatchStates.set(key, merged);

    if (this.supabase) {
      await this.supabase.from('viewer_watch_states').upsert({
        viewer_key: merged.viewerKey,
        video_id: merged.videoId,
        folder_id: merged.folderId,
        position_sec: merged.positionSec,
        duration_sec: merged.durationSec,
        favorite: merged.favorite,
        updated_at: merged.updatedAt,
      });
    }
    return merged;
  }

  public async deleteViewerWatchState(viewerKey: string, videoId: string): Promise<void> {
    const key = `${viewerKey}::${videoId}`;
    memStore.viewerWatchStates.delete(key);

    if (this.supabase) {
      await this.supabase
        .from('viewer_watch_states')
        .delete()
        .eq('viewer_key', viewerKey)
        .eq('video_id', videoId);
    }
  }

  // ==========================================================================
  // 6. analytics_state & played_videos
  // ==========================================================================
  public async recordAnalyticsCounter(delta: {
    views?: number;
    watchTimeSec?: number;
    cacheHits?: number;
    megaRequests?: number;
    cachedBytesServed?: number;
  }): Promise<void> {
    memStore.analyticsState.totalViews += delta.views || 0;
    memStore.analyticsState.totalWatchTimeSec += delta.watchTimeSec || 0;
    memStore.analyticsState.cacheHits += delta.cacheHits || 0;
    memStore.analyticsState.megaRequests += delta.megaRequests || 0;
    memStore.analyticsState.cachedBytesServed += delta.cachedBytesServed || 0;

    if (this.supabase) {
      const { data } = await this.supabase
        .from('analytics_state')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      const updated = {
        id: 1,
        total_views: Number(data?.total_views || 0) + (delta.views || 0),
        total_watch_time_sec:
          Number(data?.total_watch_time_sec || 0) + (delta.watchTimeSec || 0),
        cache_hits: Number(data?.cache_hits || 0) + (delta.cacheHits || 0),
        mega_requests: Number(data?.mega_requests || 0) + (delta.megaRequests || 0),
        cached_bytes_served:
          Number(data?.cached_bytes_served || 0) + (delta.cachedBytesServed || 0),
      };
      await this.supabase.from('analytics_state').upsert(updated);
    }
  }

  public async recordVideoPlayback(event: {
    videoId: string;
    folderId: string;
    title: string;
    folderName: string;
    genre: string;
    isViewStart?: boolean;
    watchTimeDeltaSec?: number;
  }): Promise<void> {
    const now = Date.now();
    const existing = memStore.playedVideos.get(event.videoId);
    const viewsDelta = event.isViewStart ? 1 : 0;
    const watchDelta = Math.max(0, event.watchTimeDeltaSec || 0);

    const updated: PlayedVideoStat = {
      videoId: event.videoId,
      folderId: event.folderId,
      title: event.title || existing?.title || 'Untitled Video',
      folderName: event.folderName || existing?.folderName || 'Library',
      genre: event.genre || existing?.genre || 'Cinema',
      views: (existing?.views || 0) + viewsDelta,
      watchTimeSec: (existing?.watchTimeSec || 0) + watchDelta,
      lastPlayedAt: now,
    };
    memStore.playedVideos.set(event.videoId, updated);

    await this.recordAnalyticsCounter({
      views: viewsDelta,
      watchTimeSec: watchDelta,
    });

    if (this.supabase) {
      const { data } = await this.supabase
        .from('played_videos')
        .select('*')
        .eq('video_id', event.videoId)
        .maybeSingle();

      await this.supabase.from('played_videos').upsert({
        video_id: event.videoId,
        folder_id: event.folderId,
        title: updated.title,
        folder_name: updated.folderName,
        genre: updated.genre,
        views: Number(data?.views || 0) + viewsDelta,
        watch_time_sec: Number(data?.watch_time_sec || 0) + watchDelta,
        last_played_at: now,
      });
    }
  }

  public async getAnalyticsSummary(): Promise<{
    state: StoredAnalyticsState;
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
  }> {
    let state = { ...memStore.analyticsState };
    let playedList = Array.from(memStore.playedVideos.values());

    if (this.supabase) {
      const { data: stateRow } = await this.supabase
        .from('analytics_state')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (stateRow) {
        state = {
          totalViews: Number(stateRow.total_views),
          totalWatchTimeSec: Number(stateRow.total_watch_time_sec),
          cacheHits: Number(stateRow.cache_hits),
          megaRequests: Number(stateRow.mega_requests),
          cachedBytesServed: Number(stateRow.cached_bytes_served),
        };
      }

      const { data: playedRows } = await this.supabase
        .from('played_videos')
        .select('*')
        .limit(50);

      if (playedRows && playedRows.length > 0) {
        playedList = playedRows.map((r) => ({
          videoId: r.video_id,
          folderId: r.folder_id,
          title: r.title,
          folderName: r.folder_name,
          genre: r.genre,
          views: Number(r.views),
          watchTimeSec: Number(r.watch_time_sec),
          lastPlayedAt: Number(r.last_played_at),
        }));
      }
    }

    const topVideos = [...playedList].sort((a, b) => b.views - a.views).slice(0, 10);
    const recentVideos = [...playedList]
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, 10);

    let streamBlockBytes = 0;
    for (const b of memStore.streamBlocks.values()) {
      streamBlockBytes += b.sizeBytes;
    }

    return {
      state,
      topVideos,
      recentVideos,
      cacheStats: {
        inspectCount: memStore.inspectCache.size,
        streamBlockCount: memStore.streamBlocks.size,
        streamBlockBytes,
        ticketCount: memStore.megaStorageTickets.size,
        nodeKeyCount: memStore.megaNodeKeys.size,
        thumbnailCount: memStore.videoThumbnails.size,
      },
    };
  }

  // ==========================================================================
  // 7. admin_config
  // ==========================================================================
  public async getAdminConfig(): Promise<StoredAdminConfig | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('admin_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (!error && data) {
        const cfg: StoredAdminConfig = {
          id: 1,
          username: data.username,
          email: data.email,
          passwordSalt: data.password_salt,
          passwordHash: data.password_hash,
          updatedAt: Number(data.updated_at),
        };
        memStore.adminConfig = cfg;
        return cfg;
      }
    }
    return memStore.adminConfig;
  }

  public async saveAdminConfig(config: Omit<StoredAdminConfig, 'id'>): Promise<StoredAdminConfig> {
    const record: StoredAdminConfig = {
      id: 1,
      ...config,
    };
    memStore.adminConfig = record;

    if (this.supabase) {
      await this.supabase.from('admin_config').upsert({
        id: 1,
        username: record.username,
        email: record.email,
        password_salt: record.passwordSalt,
        password_hash: record.passwordHash,
        updated_at: record.updatedAt,
      });
    }
    return record;
  }

  // ==========================================================================
  // 8. Cache Management (POST /api/admin/cache/clear)
  // ==========================================================================
  public async clearCaches(categories: string[]): Promise<{ cleared: string[] }> {
    const cleared: string[] = [];
    const targetSet = new Set(categories.map((c) => c.toLowerCase()));

    if (targetSet.has('inspect_cache') || targetSet.has('all')) {
      memStore.inspectCache.clear();
      cleared.push('inspect_cache');
      if (this.supabase) {
        await this.supabase.from('inspect_cache').delete().neq('cache_key', '');
      }
    }

    if (targetSet.has('stream_blocks') || targetSet.has('all')) {
      memStore.streamBlocks.clear();
      cleared.push('stream_blocks');
      if (this.supabase) {
        await this.supabase.from('stream_blocks').delete().neq('block_key', '');
      }
    }

    if (targetSet.has('mega_storage_tickets') || targetSet.has('all')) {
      memStore.megaStorageTickets.clear();
      cleared.push('mega_storage_tickets');
      if (this.supabase) {
        await this.supabase.from('mega_storage_tickets').delete().neq('stream_key', '');
      }
    }

    if (targetSet.has('mega_node_keys') || targetSet.has('all')) {
      memStore.megaNodeKeys.clear();
      cleared.push('mega_node_keys');
      if (this.supabase) {
        await this.supabase.from('mega_node_keys').delete().neq('node_cache_key', '');
      }
    }

    return { cleared };
  }
}
