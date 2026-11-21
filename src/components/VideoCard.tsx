// ============================================================================
// CineMega — Video Card & Temporary Dark-Slate Thumbnail Renderer
// ============================================================================
// Never uses stock external photography. When a video has a stored thumbnail
// in Supabase (`video_thumbnails`), renders `/api/thumbnails/:fileName` with
// an error fallback. Otherwise renders the dark-slate Temporary Thumbnail UI
// showing the video title, folder/genre metadata, and 30-second queue status.

import { Bookmark, Check, Film, Play } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCineMega } from '../context/CineMegaContext';
import type { LibraryFolder, VideoItem } from '../types/cinemega';
import { apiWorkerPool } from '../utils/apiBase';
import { formatBytes, formatDuration } from '../utils/formatters';

interface VideoCardProps {
  video: VideoItem;
  folder?: LibraryFolder;
  showProgress?: boolean;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  folder,
  showProgress = true,
}) => {
  const { watchStates, toggleFavorite, getThumbnailStatus } = useCineMega();
  const [imgFailed, setImgFailed] = useState(false);

  const watchState = watchStates[video.id];
  const isFavorite = Boolean(watchState?.favorite);
  const progressPercent =
    watchState && watchState.durationSec > 0
      ? Math.min(100, Math.round((watchState.positionSec / watchState.durationSec) * 100))
      : 0;

  const thumbStatus = getThumbnailStatus(video);
  const hasRealThumbnail = Boolean(video.thumbnailFileName) && !imgFailed;
  const thumbnailUrl = video.thumbnailFileName
    ? apiWorkerPool.getThumbnailUrl(video.thumbnailFileName)
    : '';

  const genreLabel = folder?.genre || 'Cinema';
  const folderName = folder?.name || 'Archive';

  return (
    <div className="group relative flex flex-col rounded-xl bg-zinc-900/70 border border-zinc-800/80 hover:border-amber-500/50 transition-colors overflow-hidden">
      {/* Thumbnail Viewport */}
      <Link
        to={`/watch/${encodeURIComponent(video.id)}`}
        aria-label={`Watch ${video.title}`}
        className="relative aspect-video w-full bg-[#111115] overflow-hidden block focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        {hasRealThumbnail ? (
          <img
            src={thumbnailUrl}
            alt={video.title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
          />
        ) : (
          /* Temporary Dark-Slate Thumbnail Visual (No stock images) */
          <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-[#121217] via-[#17171f] to-[#23190d] select-none">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-400">
              <span className="text-amber-400/95 font-medium whitespace-nowrap">
                {genreLabel}
                {video.episodeLabel ? ` · ${video.episodeLabel}` : ''}
              </span>
              <span className="text-[10px] text-zinc-500 truncate text-right">{thumbStatus}</span>
            </div>

            <div className="my-auto py-1">
              <div className="flex items-center gap-2 text-zinc-300">
                <Film className="w-4 h-4 text-amber-500/80 shrink-0" />
                <p className="font-display text-sm font-semibold text-zinc-100 line-clamp-2 leading-snug">
                  {video.title}
                </p>
              </div>
              <p className="mt-1 text-xs text-zinc-400 truncate">{folderName}</p>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 tabular-nums">
              <span>
                {video.extension.toUpperCase()} · {formatBytes(video.sizeBytes)}
              </span>
              {video.durationSec ? <span>{formatDuration(video.durationSec)}</span> : null}
            </div>
          </div>
        )}

        {/* Measured Contrast Scrim & Play Affordance on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center">
          <span className="w-11 h-11 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center shadow-lg transform scale-95 group-hover:scale-100 transition-transform duration-150">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </span>
        </div>

        {/* Watch Progress Bar */}
        {showProgress && progressPercent > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-zinc-800">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </Link>

      {/* Card Footer Metadata (Zero-Pill Unboxed Text with Typographic Separators) */}
      <div className="p-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/watch/${encodeURIComponent(video.id)}`}
            className="font-display text-sm font-semibold text-zinc-100 hover:text-amber-400 transition-colors line-clamp-1 block"
          >
            {video.title}
          </Link>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 truncate tabular-nums">
            <span className="truncate">{genreLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[11px] text-zinc-400">
              {formatBytes(video.sizeBytes)}
            </span>
            {video.durationSec ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] text-zinc-400">
                  {formatDuration(video.durationSec)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void toggleFavorite(video)}
          aria-label={
            isFavorite
              ? `Remove ${video.title} from My List`
              : `Add ${video.title} to My List`
          }
          className={`p-2 rounded-lg border transition-colors shrink-0 ${
            isFavorite
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
          }`}
        >
          {isFavorite ? (
            <Check className="w-4 h-4" />
          ) : (
            <Bookmark className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};
