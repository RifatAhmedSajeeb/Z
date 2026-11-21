// ============================================================================
// CineMega — Library Page (`/library`) & Folder Detail Page (`/folder/:folderId`)
// ============================================================================

import { ArrowLeft, FolderOpen, Play, Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { useCineMega } from '../context/CineMegaContext';
import { formatBytes } from '../utils/formatters';

export const LibraryPage: React.FC = () => {
  const { allVideos, folders, loading } = useCineMega();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');

  const genres = useMemo(() => {
    const set = new Set<string>(['All']);
    for (const f of folders) {
      if (f.genre) set.add(f.genre);
    }
    return Array.from(set);
  }, [folders]);

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allVideos.filter(({ video, folder }) => {
      if (selectedGenre !== 'All' && folder.genre !== selectedGenre) {
        return false;
      }
      if (!q) return true;
      return (
        video.title.toLowerCase().includes(q) ||
        folder.name.toLowerCase().includes(q) ||
        folder.genre.toLowerCase().includes(q)
      );
    });
  }, [allVideos, searchQuery, selectedGenre]);

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-zinc-100">
            Cinema Library
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Browse and filter all {allVideos.length} videos across {folders.length} Mega.nz collections
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Filter library videos"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by title, folder, or genre..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Interactive Genre Filter Segmented Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {genres.map((genre) => {
          const active = selectedGenre === genre;
          return (
            <button
              key={genre}
              type="button"
              onClick={() => setSelectedGenre(genre)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100 border border-zinc-800/80'
              }`}
            >
              {genre}
            </button>
          );
        })}
      </div>

      {/* Responsive Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className="aspect-video rounded-xl bg-zinc-900/60 border border-zinc-800 animate-pulse"
            />
          ))}
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
          <p className="font-display text-lg font-semibold text-zinc-200">
            No matching videos found
          </p>
          <p className="text-xs text-zinc-400">
            Try clearing your search filter or adding a new Mega.nz folder in the Admin Console.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedGenre('All');
            }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredVideos.map(({ video, folder }) => (
            <VideoCard key={video.id} video={video} folder={folder} />
          ))}
        </div>
      )}
    </main>
  );
};

export const FolderDetailPage: React.FC = () => {
  const { folderId } = useParams<{ folderId: string }>();
  const { folders, loading } = useCineMega();

  const folder = useMemo(
    () => folders.find((f) => f.id === folderId) || null,
    [folders, folderId]
  );

  if (loading) {
    return (
      <main className="max-w-[1360px] mx-auto px-6 py-10">
        <div className="h-48 rounded-2xl bg-zinc-900/60 animate-pulse" />
      </main>
    );
  }

  if (!folder) {
    return (
      <main className="max-w-[1360px] mx-auto px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-zinc-100">
          Folder Collection Not Found
        </h1>
        <Link
          to="/library"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Library
        </Link>
      </main>
    );
  }

  const firstVideo = folder.videos[0];

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-8">
      <div>
        <Link
          to="/library"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-amber-400 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Library
        </Link>
      </div>

      <section className="p-8 rounded-2xl bg-zinc-900/70 border border-zinc-800/90 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 tabular-nums">
            <FolderOpen className="w-4 h-4" />
            <span>{folder.genre}</span>
            <span aria-hidden="true">·</span>
            <span>{folder.videos.length} Videos</span>
            <span aria-hidden="true">·</span>
            <span>{formatBytes(folder.totalSizeBytes)}</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-zinc-100">
            {folder.name}
          </h1>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {folder.description}
          </p>
        </div>

        {firstVideo && (
          <Link
            to={`/watch/${encodeURIComponent(firstVideo.id)}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            Play First Video
          </Link>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-bold text-zinc-100">
          Videos in Collection ({folder.videos.length})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {folder.videos.map((video) => (
            <VideoCard key={video.id} video={video} folder={folder} />
          ))}
        </div>
      </section>
    </main>
  );
};
