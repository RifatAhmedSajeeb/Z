// ============================================================================
// CineMega — Custom Full-Screen Cinema Video Player (`/watch/:videoId`)
// ============================================================================
// Custom HTML5 byte-range video player (no native controls) featuring:
// Play/Pause, Skip +/-10s, Seek bar with buffered progress, Volume & Mute,
// Playback speed (0.5x to 2x), Picture-in-Picture, Fullscreen, Keyboard
// shortcuts (Space, K, ArrowLeft, ArrowRight, M, F), Auto-play next video,
// Folder queue drawer, Resume playback, and Analytics event reporting.

import {
  ArrowLeft,
  Bookmark,
  Check,
  FastForward,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Rewind,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCineMega } from '../context/CineMegaContext';
import { apiWorkerPool } from '../utils/apiBase';
import { formatBytes, formatDuration } from '../utils/formatters';

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const WatchPage: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const {
    getVideoById,
    watchStates,
    toggleFavorite,
    updateWatchProgress,
  } = useCineMega();

  const entry = videoId ? getVideoById(videoId) : null;
  const video = entry?.video || null;
  const folder = entry?.folder || null;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(true);
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [hasResumedInitial, setHasResumedInitial] = useState(false);

  const lastSavedSecRef = useRef<number>(0);
  const viewReportedRef = useRef<string | null>(null);

  // Determine next video in folder queue
  const nextVideo = React.useMemo(() => {
    if (!folder || !video) return null;
    const idx = folder.videos.findIndex((v) => v.id === video.id);
    if (idx >= 0 && idx + 1 < folder.videos.length) {
      return folder.videos[idx + 1];
    }
    return null;
  }, [folder, video]);

  // Reset state when switching videoId
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setBufferedEnd(0);
    setHasResumedInitial(false);
    lastSavedSecRef.current = 0;
  }, [videoId]);

  // Report initial `view_start` analytics event
  useEffect(() => {
    if (!video || !folder) return;
    if (viewReportedRef.current === video.id) return;
    viewReportedRef.current = video.id;

    void apiWorkerPool
      .fetchApi('/api/analytics/event', {
        method: 'POST',
        body: JSON.stringify({
          videoId: video.id,
          folderId: folder.id,
          title: video.title,
          folderName: folder.name,
          genre: folder.genre,
          eventType: 'view_start',
          watchTimeDeltaSec: 0,
        }),
      })
      .catch(() => {});
  }, [video, folder]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, []);

  const skipSeconds = useCallback((delta: number) => {
    const el = videoRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(el.duration || 3600, el.currentTime + delta));
    el.currentTime = target;
    setCurrentTime(target);
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const nextMute = !el.muted;
    el.muted = nextMute;
    setIsMuted(nextMute);
  }, []);

  const handleVolumeChange = useCallback((nextVol: number) => {
    const el = videoRef.current;
    const clamped = Math.max(0, Math.min(1, nextVol));
    setVolume(clamped);
    if (el) {
      el.volume = clamped;
      el.muted = clamped === 0;
    }
    setIsMuted(clamped === 0);
  }, []);

  const handleSpeedChange = useCallback((rate: number) => {
    const el = videoRef.current;
    setPlaybackRate(rate);
    if (el) {
      el.playbackRate = rate;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const togglePiP = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture?.().catch(() => {});
    } else {
      el.requestPictureInPicture?.().catch(() => {});
    }
  }, []);

  // Keyboard shortcuts: Space, K, ArrowLeft, ArrowRight, M, F
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.code === 'Space' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skipSeconds(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skipSeconds(10);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, skipSeconds, toggleMute, toggleFullscreen]);

  if (!video || !folder) {
    return (
      <main className="max-w-[1360px] mx-auto px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-zinc-100">
          Video Stream Not Found
        </h1>
        <p className="text-xs text-zinc-400">
          The requested opaque video identifier ({videoId}) does not exist in the catalog.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Return Home
        </Link>
      </main>
    );
  }

  const streamUrl = apiWorkerPool.getStreamUrlForVideo(video.id);
  const isFavorite = Boolean(watchStates[video.id]?.favorite);
  const effectiveDuration = duration > 0 ? duration : video.durationSec || 100;

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Cinema Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/folder/${encodeURIComponent(folder.id)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-300"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {folder.name}
          </Link>
          <span className="text-xs font-mono text-amber-400">
            {folder.genre}
          </span>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <span className="text-xs font-mono text-zinc-500">
            {video.id}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void toggleFavorite(video)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isFavorite
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-400'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100'
            }`}
          >
            {isFavorite ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            {isFavorite ? 'Saved in My List' : 'Add to My List'}
          </button>

          <button
            type="button"
            onClick={() => setQueueOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              queueOpen
                ? 'border-amber-500/60 bg-zinc-900 text-amber-400'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300'
            }`}
          >
            <ListVideo className="w-3.5 h-3.5" />
            Folder Queue ({folder.videos.length})
          </button>
        </div>
      </div>

      {/* Main Split: Custom Video Player Stage + Folder Queue Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          ref={containerRef}
          className={`${
            queueOpen ? 'lg:col-span-8' : 'lg:col-span-12'
          } rounded-2xl overflow-hidden bg-black border border-zinc-800/90 flex flex-col`}
        >
          {/* Video Surface */}
          <div
            onClick={togglePlay}
            className="relative aspect-video w-full bg-[#060608] flex items-center justify-center cursor-pointer select-none"
          >
            <video
              ref={videoRef}
              src={streamUrl}
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                setDuration(el.duration || video.durationSec || 0);
                // Resume saved playback position if available
                const savedPos = watchStates[video.id]?.positionSec || 0;
                if (!hasResumedInitial && savedPos > 1 && savedPos < (el.duration || 3600) - 2) {
                  el.currentTime = savedPos;
                  setCurrentTime(savedPos);
                  setHasResumedInitial(true);
                }
              }}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                const nowSec = el.currentTime;
                setCurrentTime(nowSec);

                if (el.buffered.length > 0) {
                  setBufferedEnd(el.buffered.end(el.buffered.length - 1));
                }

                // Persist watch progress and heartbeat analytics every 5 seconds
                if (Math.abs(nowSec - lastSavedSecRef.current) >= 5) {
                  const delta = Math.max(0, nowSec - lastSavedSecRef.current);
                  lastSavedSecRef.current = nowSec;
                  void updateWatchProgress(video, nowSec, el.duration || video.durationSec || 0);

                  if (delta > 0 && delta <= 30) {
                    void apiWorkerPool
                      .fetchApi('/api/analytics/event', {
                        method: 'POST',
                        body: JSON.stringify({
                          videoId: video.id,
                          folderId: folder.id,
                          title: video.title,
                          folderName: folder.name,
                          genre: folder.genre,
                          eventType: 'heartbeat',
                          watchTimeDeltaSec: delta,
                        }),
                      })
                      .catch(() => {});
                  }
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                void updateWatchProgress(video, duration, duration);
                if (autoPlayNext && nextVideo) {
                  navigate(`/watch/${encodeURIComponent(nextVideo.id)}`);
                }
              }}
              className="w-full h-full object-contain"
            />

            {/* Center Play Overlay when Paused */}
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center shadow-xl">
                  <Play className="w-7 h-7 fill-current ml-1" />
                </div>
                <div className="text-center px-4">
                  <p className="font-display text-base font-bold text-zinc-100">
                    {video.title}
                  </p>
                  <p className="text-xs font-mono text-zinc-400 mt-0.5">
                    Press Space or Click to Play · HTTP 206 Byte-Range Stream
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Custom Cinema Player Control Deck (No native controls) */}
          <div className="p-4 bg-[#0e0e12] border-t border-zinc-800/80 space-y-3">
            {/* Seek Bar with Buffered Progress */}
            <div className="space-y-1.5">
              <div className="relative flex items-center">
                <input
                  type="range"
                  aria-label="Seek video position"
                  min={0}
                  max={effectiveDuration}
                  step={0.1}
                  value={Math.min(currentTime, effectiveDuration)}
                  onChange={(e) => {
                    const nextSec = parseFloat(e.target.value);
                    setCurrentTime(nextSec);
                    if (videoRef.current) {
                      videoRef.current.currentTime = nextSec;
                    }
                    void updateWatchProgress(video, nextSec, effectiveDuration);
                  }}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 tabular-nums">
                <span>
                  {formatDuration(currentTime)} / {formatDuration(effectiveDuration)}
                </span>
                <span>
                  Buffered: {formatDuration(bufferedEnd)} · {video.extension.toUpperCase()} ({formatBytes(video.sizeBytes)})
                </span>
              </div>
            </div>

            {/* Primary Transport & Audio/Speed/Fullscreen Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Left Transport Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Play
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => skipSeconds(-10)}
                  aria-label="Skip backward 10 seconds"
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs inline-flex items-center gap-1"
                >
                  <Rewind className="w-4 h-4" />
                  <span className="font-mono text-[11px]">-10s</span>
                </button>

                <button
                  type="button"
                  onClick={() => skipSeconds(10)}
                  aria-label="Skip forward 10 seconds"
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs inline-flex items-center gap-1"
                >
                  <FastForward className="w-4 h-4" />
                  <span className="font-mono text-[11px]">+10s</span>
                </button>

                {/* Volume & Mute */}
                <div className="flex items-center gap-2 pl-2">
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    aria-label="Volume"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-20 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>

              {/* Right Controls: Speed (0.5x to 2x), Auto-Next, PiP, Fullscreen */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span className="sr-only">Playback speed</span>
                  <select
                    aria-label="Playback speed"
                    value={playbackRate}
                    onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
                  >
                    {PLAYBACK_SPEEDS.map((spd) => (
                      <option key={spd} value={spd}>
                        {spd}x
                      </option>
                    ))}
                  </select>
                </label>

                {nextVideo && (
                  <button
                    type="button"
                    onClick={() => navigate(`/watch/${encodeURIComponent(nextVideo.id)}`)}
                    aria-label={`Next video: ${nextVideo.title}`}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 inline-flex items-center gap-1"
                  >
                    <SkipForward className="w-3.5 h-3.5 text-amber-400" />
                    Next
                  </button>
                )}

                <button
                  type="button"
                  onClick={togglePiP}
                  aria-label="Picture in Picture"
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800"
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Video Details & Keyboard Shortcuts Bar */}
          <div className="p-5 bg-zinc-900/50 border-t border-zinc-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-xl font-bold text-zinc-100">
                {video.title}
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                {folder.name} · {folder.genre} · Raw Source: <code className="text-zinc-300">{video.rawFileName}</code>
              </p>
            </div>

            <div className="text-[11px] font-mono text-zinc-400 flex flex-wrap items-center gap-3">
              <span>Shortcuts:</span>
              <span>[Space/K] Play</span>
              <span>[←/→] ±10s</span>
              <span>[M] Mute</span>
              <span>[F] Fullscreen</span>
            </div>
          </div>
        </div>

        {/* Folder Queue Drawer */}
        {queueOpen && (
          <aside
            aria-label="Folder Video Queue"
            className="lg:col-span-4 rounded-2xl bg-zinc-900/70 border border-zinc-800/90 p-4 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-zinc-100">
                  Collection Queue
                </h2>
                <p className="text-xs text-zinc-400 truncate">
                  {folder.name} ({folder.videos.length}{' '}
                  {folder.videos.length === 1 ? 'video' : 'videos'})
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPlayNext}
                  onChange={(e) => setAutoPlayNext(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                Auto-Play
              </label>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {folder.videos.map((item, index) => {
                const isCurrent = item.id === video.id;
                const itemProgress = watchStates[item.id];
                return (
                  <Link
                    key={item.id}
                    to={`/watch/${encodeURIComponent(item.id)}`}
                    className={`p-3 rounded-xl border transition-colors flex items-start gap-3 ${
                      isCurrent
                        ? 'bg-amber-500/15 border-amber-500/60 text-zinc-100'
                        : 'bg-zinc-900/80 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <span className="font-mono text-xs text-amber-400 pt-0.5 tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-xs font-semibold truncate">
                        {item.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-zinc-400 tabular-nums">
                        <span>{item.extension.toUpperCase()}</span>
                        <span>·</span>
                        <span>{formatBytes(item.sizeBytes)}</span>
                        {itemProgress && itemProgress.positionSec > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-400">
                              {formatDuration(itemProgress.positionSec)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
};
