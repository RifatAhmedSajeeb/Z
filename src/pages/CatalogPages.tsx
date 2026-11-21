// ============================================================================
// CineMega — Genres Directory (`/genres`), Genre Filtered (`/genre/:genreName`),
// My List (`/mylist`), and Instant Search (`/search`)
// ============================================================================

import { ArrowLeft, Bookmark, Film, Search as SearchIcon } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { VideoCard } from '../components/VideoCard';
import { useCineMega } from '../context/CineMegaContext';
import { formatBytes } from '../utils/formatters';

export const GenresDirectoryPage: React.FC = () => {
  const { folders, allVideos } = useCineMega();

  const genreStats = useMemo(() => {
    const map = new Map<
      string,
      { genre: string; videoCount: number; folderCount: number; totalBytes: number }
    >();

    for (const folder of folders) {
      const g = folder.genre || 'Cinema';
      const current = map.get(g) || {
        genre: g,
        videoCount: 0,
        folderCount: 0,
        totalBytes: 0,
      };
      current.folderCount += 1;
      current.videoCount += folder.videos.length;
      current.totalBytes += folder.totalSizeBytes;
      map.set(g, current);
    }

    return Array.from(map.values());
  }, [folders]);

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-8">
      <div className="border-b border-zinc-800/80 pb-6">
        <h1 className="font-display text-3xl font-bold text-zinc-100">
          Genre Directory
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Explore {genreStats.length} curated categories across {allVideos.length} videos
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {genreStats.map((item) => (
          <Link
            key={item.genre}
            to={`/genre/${encodeURIComponent(item.genre)}`}
            className="group p-6 rounded-xl bg-zinc-900/70 border border-zinc-800/80 hover:border-amber-500/60 transition-colors flex flex-col justify-between gap-6"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-amber-400">
                {item.folderCount} {item.folderCount === 1 ? 'Collection' : 'Collections'}
              </span>
              <Film className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors" />
            </div>

            <div>
              <h2 className="font-display text-2xl font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">
                {item.genre}
              </h2>
              <p className="mt-1 text-xs font-mono text-zinc-400 tabular-nums">
                {item.videoCount} {item.videoCount === 1 ? 'Video' : 'Videos'} ·{' '}
                {formatBytes(item.totalBytes)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
};

export const GenreDetailPage: React.FC = () => {
  const { genreName } = useParams<{ genreName: string }>();
  const decodedGenre = decodeURIComponent(genreName || '');
  const { allVideos } = useCineMega();

  const matchingVideos = useMemo(
    () =>
      allVideos.filter(
        ({ folder }) => folder.genre.toLowerCase() === decodedGenre.toLowerCase()
      ),
    [allVideos, decodedGenre]
  );

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-8">
      <div>
        <Link
          to="/genres"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-amber-400"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Genres
        </Link>
      </div>

      <div className="border-b border-zinc-800/80 pb-6">
        <div className="text-xs font-mono text-amber-400">GENRE ARCHIVE</div>
        <h1 className="font-display text-3xl font-bold text-zinc-100 mt-1">
          {decodedGenre}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          {matchingVideos.length} {matchingVideos.length === 1 ? 'video' : 'videos'} available for streaming
        </p>
      </div>

      {matchingVideos.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-zinc-900/50 border border-zinc-800">
          <p className="text-sm text-zinc-400">
            No videos found in the {decodedGenre} genre.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {matchingVideos.map(({ video, folder }) => (
            <VideoCard key={video.id} video={video} folder={folder} />
          ))}
        </div>
      )}
    </main>
  );
};

export const MyListPage: React.FC = () => {
  const { allVideos, watchStates } = useCineMega();

  const favoriteVideos = useMemo(() => {
    return allVideos.filter(({ video }) => Boolean(watchStates[video.id]?.favorite));
  }, [allVideos, watchStates]);

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-8">
      <div className="border-b border-zinc-800/80 pb-6">
        <h1 className="font-display text-3xl font-bold text-zinc-100">
          My List
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Bookmarked personal cinema releases synced with your anonymous viewer profile
        </p>
      </div>

      {favoriteVideos.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
          <Bookmark className="w-8 h-8 text-amber-500/80 mx-auto" />
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-zinc-200">
              Your watchlist is empty
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Bookmark any video card across the library to save it to your personal watchlist.
            </p>
          </div>
          <Link
            to="/library"
            className="inline-block px-5 py-2.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold hover:bg-amber-400"
          >
            Explore Library
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {favoriteVideos.map(({ video, folder }) => (
            <VideoCard key={video.id} video={video} folder={folder} />
          ))}
        </div>
      )}
    </main>
  );
};

export const SearchPage: React.FC = () => {
  const { allVideos, folders } = useCineMega();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allVideos;
    return allVideos.filter(({ video, folder }) => {
      return (
        video.title.toLowerCase().includes(q) ||
        video.rawFileName.toLowerCase().includes(q) ||
        folder.name.toLowerCase().includes(q) ||
        folder.genre.toLowerCase().includes(q)
      );
    });
  }, [allVideos, query]);

  const matchingFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return folders.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.genre.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q)
    );
  }, [folders, query]);

  return (
    <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-8">
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold text-zinc-100">
          Instant Cinema Search
        </h1>
        <div className="relative max-w-2xl">
          <SearchIcon className="w-5 h-5 text-amber-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search across video titles, folder names, and genres"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search video titles, Mega folder names, or genres..."
            className="w-full pl-12 pr-4 py-3.5 text-base rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {matchingFolders.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-base font-semibold text-zinc-300">
            Matching Collections ({matchingFolders.length})
          </h2>
          <div className="flex flex-wrap gap-3">
            {matchingFolders.map((folder) => (
              <Link
                key={folder.id}
                to={`/folder/${encodeURIComponent(folder.id)}`}
                className="px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-amber-500/60 text-xs font-medium text-zinc-200"
              >
                {folder.name} · <span className="text-amber-400">{folder.genre}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-zinc-100">
            {query.trim()
              ? `Search Results (${results.length})`
              : `All Indexed Videos (${results.length})`}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {results.map(({ video, folder }) => (
            <VideoCard key={video.id} video={video} folder={folder} />
          ))}
        </div>
      </section>
    </main>
  );
};
