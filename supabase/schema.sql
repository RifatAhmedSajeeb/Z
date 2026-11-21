-- ============================================================================
-- CineMega — Supabase PostgreSQL Schema & Row-Level Security (RLS)
-- ============================================================================
-- Run this complete script in your Supabase SQL Editor.
-- All tables have Row Level Security (RLS) enabled. Backend workers access
-- tables exclusively through SUPABASE_SERVICE_ROLE_KEY.

-- 1. library_meta
-- Stores global library settings and metadata.
CREATE TABLE IF NOT EXISTS public.library_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 2. library_folders
-- Stores the library catalog, folder information and embedded video metadata.
CREATE TABLE IF NOT EXISTS public.library_folders (
  folder_id TEXT PRIMARY KEY,
  position INT NOT NULL DEFAULT 0,
  folder_json JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_library_folders_position ON public.library_folders (position ASC);

-- 3. video_thumbnails
-- Stores real generated video thumbnails.
CREATE TABLE IF NOT EXISTS public.video_thumbnails (
  file_name TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  base64_data TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_thumbnails_video_id ON public.video_thumbnails (video_id);

-- 4. inspect_cache
-- Stores cached Mega folder/file inspection data.
CREATE TABLE IF NOT EXISTS public.inspect_cache (
  cache_key TEXT PRIMARY KEY,
  folder_name TEXT NOT NULL,
  suggested_genre TEXT NOT NULL,
  source_type TEXT NOT NULL,
  mega_url TEXT NOT NULL,
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  videos_json JSONB NOT NULL,
  cached_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inspect_cache_expires ON public.inspect_cache (expires_at);

-- 5. stream_blocks
-- Stores shared decrypted streaming block data where applicable.
CREATE TABLE IF NOT EXISTS public.stream_blocks (
  block_key TEXT PRIMARY KEY,
  stream_key TEXT NOT NULL,
  block_index INT NOT NULL,
  data_base64 TEXT NOT NULL,
  size_bytes INT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stream_blocks_stream_key ON public.stream_blocks (stream_key, block_index);
CREATE INDEX IF NOT EXISTS idx_stream_blocks_expires ON public.stream_blocks (expires_at);

-- 6. mega_node_keys
-- Stores cached Mega node encryption metadata.
CREATE TABLE IF NOT EXISTS public.mega_node_keys (
  node_cache_key TEXT PRIMARY KEY,
  root_url TEXT NOT NULL,
  node_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  key_b64 TEXT NOT NULL,
  download_id_json JSONB NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mega_node_keys_expires ON public.mega_node_keys (expires_at);

-- 7. mega_storage_tickets
-- Stores temporary Mega download information.
CREATE TABLE IF NOT EXISTS public.mega_storage_tickets (
  stream_key TEXT PRIMARY KEY,
  cdn_url TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  key_b64 TEXT NOT NULL,
  strategy_used TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mega_storage_tickets_expires ON public.mega_storage_tickets (expires_at);

-- 8. analytics_state
-- Stores global analytics counters.
CREATE TABLE IF NOT EXISTS public.analytics_state (
  id INT PRIMARY KEY CHECK (id = 1),
  total_views BIGINT NOT NULL DEFAULT 0,
  total_watch_time_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  cache_hits BIGINT NOT NULL DEFAULT 0,
  mega_requests BIGINT NOT NULL DEFAULT 0,
  cached_bytes_served BIGINT NOT NULL DEFAULT 0
);

INSERT INTO public.analytics_state (id, total_views, total_watch_time_sec, cache_hits, mega_requests, cached_bytes_served)
VALUES (1, 0, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 9. played_videos
-- Stores playback statistics.
CREATE TABLE IF NOT EXISTS public.played_videos (
  video_id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  title TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  genre TEXT NOT NULL,
  views BIGINT NOT NULL DEFAULT 0,
  watch_time_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_played_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_played_videos_views ON public.played_videos (views DESC);
CREATE INDEX IF NOT EXISTS idx_played_videos_last_played ON public.played_videos (last_played_at DESC);

-- 10. admin_config
-- Stores administrator credentials.
CREATE TABLE IF NOT EXISTS public.admin_config (
  id INT PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 11. viewer_watch_states
-- Stores Continue Watching and My List information.
CREATE TABLE IF NOT EXISTS public.viewer_watch_states (
  viewer_key TEXT NOT NULL,
  video_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  position_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (viewer_key, video_id)
);

CREATE INDEX IF NOT EXISTS idx_viewer_watch_states_viewer ON public.viewer_watch_states (viewer_key, updated_at DESC);

-- ============================================================================
-- Enable Row Level Security (RLS) on All Application Tables
-- ============================================================================
ALTER TABLE public.library_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_thumbnails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspect_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_node_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_storage_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.played_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viewer_watch_states ENABLE ROW LEVEL SECURITY;

-- Note: With RLS enabled and no public policies created, direct anonymous or
-- browser-side anon-key access is completely blocked. Only backend workers
-- authenticating with SUPABASE_SERVICE_ROLE_KEY can read and write records.
