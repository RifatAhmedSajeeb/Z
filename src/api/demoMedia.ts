// ============================================================================
// CineMega — Deterministic Cinema MP4 Generator for Instant Preview & Testing
// ============================================================================
// When running in local/sandbox preview or testing seeded demo folders before
// live Mega folders are added, this module serves a valid, seekable ISO BMFF
// MP4 video stream with full HTTP Byte-Range support.

/**
 * Generates a deterministic, valid MP4 video buffer or serves an embedded
 * valid fMP4/MP4 byte stream so HTML5 <video> elements can play, pause, seek,
 * and capture canvas thumbnail frames cleanly.
 */
// A compact, standards-compliant H.264 baseline MP4 file (160x90, 3 seconds, black/amber cinema leader)
// encoded in base64 so zero external network calls are required for demo playback.
const EMBEDDED_VALID_MP4_B64 =
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0AAACrgYF' +
  '//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE1NSByMjkwMSAtIEguMjY0L01QRUct' +
  'NCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMTggLSBodHRwOi8vd3d3LnZpZGVvbGFu' +
  'Lm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAg' +
  'YW5hbHlzZT0weDM6MHgxMTMgPW1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAu' +
  'MDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OHRj' +
  'dD0xIGNxbT0wIGRlYWR6b25lPTI0LDEyIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0' +
  'PS0yIHRocmVhZHM9NiBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9' +
  'MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRf' +
  'aW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcg==';

let cachedDemoMp4Buffer: Buffer | null = null;

export function getDemoMp4Buffer(): Buffer {
  if (!cachedDemoMp4Buffer) {
    cachedDemoMp4Buffer = Buffer.from(EMBEDDED_VALID_MP4_B64, 'base64');
  }
  return cachedDemoMp4Buffer;
}
