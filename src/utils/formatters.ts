// ============================================================================
// CineMega — Formatting Helpers (Bytes, Duration, Relative Timestamps)
// ============================================================================

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatWatchHours(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const hours = seconds / 3600;
  if (hours >= 1) {
    return `${hours.toFixed(1)}h`;
  }
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins}m`;
}
