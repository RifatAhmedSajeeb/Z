// ============================================================================
// CineMega — Home Page (`/`)
// ============================================================================
// Features Hero Spotlight, Continue Watching, Featured Content, Genre Rows,
// Library Folders, and Recently Added Content.

import { Bookmark, Check, ChevronRight, FolderOpen, Play } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { useCineMega } from '../context/CineMegaContext';
import { formatBytes, formatDuration } from '../utils/formatters';

export const HomePage: React.FC = () => {
  const {
    folders,
    allVideos,
    watchStates,
    loading,
    error,
    toggleFavorite,
    removeWatchState,
  } = useCineMega();

  const spotlight = allVideos[0] || null;

  // Continue Watching: videos with positionSec > 0
  const continueWatching = React.useMemo(() => {
    const items = [];
    for (const entry of allVideos) {
      const ws = watchStates[entry.video.id];
      if (ws && ws.positionSec > 0) {
        items.push({ ...entry, watchState: ws });
      }
    }
    return items.sort((a, b) => b.watchState.updatedAt - a.watchState.updatedAt);
  }, [allVideos, watchStates]);

  // Group videos by Genre
  const genreGroups = React.useMemo(() => {
    const map = new Map<string, typeof allVideos>();
    for (const entry of allVideos) {
      const g = entry.folder.genre || 'Cinema';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(entry);
    }
    return Array.from(map.entries());
  }, [allVideos]);

  // Recently added content
  const recentlyAdded = React.useMemo(() => {
    return [...allVideos]
      .sort((a, b) => b.video.addedAt - a.video.addedAt)
      .slice(0, 8);
  }, [allVideos]);

  if (loading) {
    return (
      <main className="max-w-[1360px] mx-auto px-6 py-10 space-y-10">
        <div className="h-[380px] rounded-2xl bg-zinc-900/60 border border-zinc-800/80 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="aspect-video rounded-xl bg-zinc-900/60 border border-zinc-800/80 animate-pulse"
            />
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-[1360px] mx-auto px-6 py-16">
        <div className="p-8 rounded-2xl bg-zinc-900/80 border border-red-500/30 text-center max-w-xl mx-auto">
          <h1 className="font-display text-xl font-bold text-zinc-100">
            Unable to Connect to Distributed Worker Pool
          </h1>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-14">
      {/* 1. Hero Spotlight */}
      {spotlight ? (
        <section
          aria-label="Featured Cinema Spotlight"
          className="relative rounded-2xl overflow-hidden border border-zinc-800/90 bg-gradient-to-br from-[#13131a] via-[#17151c] to-[#281b0c] p-8 md:p-12"
        >
          <div className="max-w-2xl space-y-5">
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
              <span>FEATURED SPOTLIGHT</span>
              <span aria-hidden="true">·</span>
              <span>{spotlight.folder.genre}</span>
              <span aria-hidden="true">·</span>
              <span>{spotlight.folder.name}</span>
            </div>

            <h1
              className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-zinc-100 leading-tight"
              style={{ textWrap: 'balance' }}
            >
              {spotlight.video.title}
            </h1>

            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-xl">
              {spotlight.folder.description}
            </p>

            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 tabular-nums">
              <span>{spotlight.video.extension.toUpperCase()}</span>
              <span aria-hidden="true">·</span>
              <span>{formatBytes(spotlight.video.sizeBytes)}</span>
              {spotlight.video.durationSec ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatDuration(spotlight.video.durationSec)}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>AES-128-CTR Byte-Range Stream</span>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <Link
                to={`/watch/${encodeURIComponent(spotlight.video.id)}`}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                Stream Feature
              </Link>

              <button
                type="button"
                onClick={() => void toggleFavorite(spotlight.video)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 text-zinc-100 border border-zinc-700/80 font-medium text-sm transition-colors whitespace-nowrap shrink-0"
              >
                {watchStates[spotlight.video.id]?.favorite ? (
                  <>
                    <Check className="w-4 h-4 text-amber-400" />
                    In My List
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4" />
                    Add to My List
                  </>
                )}
              </button>

              <Link
                to={`/folder/${encodeURIComponent(spotlight.folder.id)}`}
                className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
              >
                Open Folder ({spotlight.folder.videos.length} Videos)
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* 2. Continue Watching */}
      {continueWatching.length > 0 && (
        <section aria-label="Continue Watching" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-zinc-100">
              Continue Watching
            </h2>
            <span className="text-xs font-mono text-zinc-500 tabular-nums">
              {continueWatching.length} active {continueWatching.length === 1 ? 'session' : 'sessions'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {continueWatching.map(({ video, folder, watchState }) => (
              <div key={video.id} className="space-y-1.5">
                <VideoCard video={video} folder={folder} showProgress={true} />
                <div className="flex items-center justify-between px-1 text-[11px] font-mono text-zinc-500 tabular-nums">
                  <span>
                    Resumes at {formatDuration(watchState.positionSec)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeWatchState(video.id)}
                    className="text-zinc-500 hover:text-zinc-300 underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Library Folders Catalog */}
      <section aria-label="Mega Library Collections" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-zinc-100">
              Library Folders
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Encrypted Mega.nz collections indexed in shared Supabase storage
            </p>
          </div>
          <Link
            to="/library"
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            Browse Full Catalog
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              to={`/folder/${encodeURIComponent(folder.id)}`}
              className="group p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-amber-500/50 transition-colors flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="text-amber-400 font-medium">{folder.genre}</span>
                  <span className="font-mono tabular-nums">
                    {folder.videos.length} {folder.videos.length === 1 ? 'video' : 'videos'} ·{' '}
                    {formatBytes(folder.totalSizeBytes)}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="w-5 h-5 text-amber-500 shrink-0" />
                  <h3 className="font-display text-base font-bold text-zinc-100 group-hover:text-amber-400 transition-colors truncate">
                    {folder.name}
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {folder.description}
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between text-xs text-zinc-400">
                <span className="font-mono text-[11px] text-zinc-500 truncate">
                  {folder.sourceType.toUpperCase()} SOURCE
                </span>
                <span className="text-zinc-200 group-hover:text-amber-400 font-medium inline-flex items-center gap-1">
                  Open Collection
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Recently Added Content */}
      <section aria-label="Recently Added Videos" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-zinc-100">
            Recently Added Releases
          </h2>
          <Link
            to="/library"
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            View All ({allVideos.length})
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {recentlyAdded.map(({ video, folder }) => (
            <VideoCard key={video.id} video={video} folder={folder} />
          ))}
        </div>
      </section>

      {/* 5. Genre Rows */}
      {genreGroups.map(([genreName, entries]) => (
        <section key={genreName} aria-label={`${genreName} Row`} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-zinc-100">
              {genreName}
            </h2>
            <Link
              to={`/genre/${encodeURIComponent(genreName)}`}
              className="text-xs font-semibold text-zinc-400 hover:text-amber-400 flex items-center gap-1"
            >
              Explore {genreName}
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
            {entries.map(({ video, folder }) => (
              <div key={video.id} className="w-[300px] sm:w-[320px] shrink-0">
                <VideoCard video={video} folder={folder} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
};
