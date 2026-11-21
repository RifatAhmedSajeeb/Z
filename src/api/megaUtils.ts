// ============================================================================
// CineMega — Mega.nz URL Parsing, Filename Cleaning, Genre & Range Utilities
// ============================================================================

import crypto from 'node:crypto';
import type { CinemaGenre } from '../types/cinemega';

export interface ParsedMegaUrl {
  isValid: boolean;
  normalizedUrl: string;
  sourceType: 'folder' | 'file';
  handleId: string;
  key: string;
  specificNodeId?: string;
  cacheKey: string;
  error?: string;
}

const VIDEO_MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
  ogv: 'video/ogg',
  flv: 'video/x-flv',
  '3gp': 'video/3gpp',
};

export const SUPPORTED_VIDEO_EXTENSIONS = Object.keys(VIDEO_MIME_MAP);

export const STANDARD_GENRES: CinemaGenre[] = [
  'Sci-Fi',
  'Documentary',
  'Action',
  'Noir & Mystery',
  'Animation',
  'Horror',
  'Comedy',
  'Drama & Indie',
];

/**
 * Parses and normalizes all supported Mega.nz folder and file URL formats:
 * - https://mega.nz/folder/<id>#<key>
 * - https://mega.nz/folder/<id>#<key>/file/<nodeId>
 * - https://mega.nz/file/<id>#<key>
 * - https://mega.nz/#F!<id>!<key>
 * - https://mega.nz/#!<id>!<key>
 */
export function parseMegaUrl(rawInput: string): ParsedMegaUrl {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      isValid: false,
      normalizedUrl: '',
      sourceType: 'folder',
      handleId: '',
      key: '',
      cacheKey: '',
      error: 'URL cannot be empty.',
    };
  }

  let urlObj: URL;
  try {
    urlObj = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      normalizedUrl: '',
      sourceType: 'folder',
      handleId: '',
      key: '',
      cacheKey: '',
      error: 'Invalid URL syntax.',
    };
  }

  if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
    return {
      isValid: false,
      normalizedUrl: '',
      sourceType: 'folder',
      handleId: '',
      key: '',
      cacheKey: '',
      error: 'Only HTTPS Mega.nz URLs are allowed.',
    };
  }

  const host = urlObj.hostname.toLowerCase();
  if (host !== 'mega.nz' && host !== 'www.mega.nz' && host !== 'mega.co.nz') {
    return {
      isValid: false,
      normalizedUrl: '',
      sourceType: 'folder',
      handleId: '',
      key: '',
      cacheKey: '',
      error: 'Only mega.nz domains are permitted.',
    };
  }

  const pathname = urlObj.pathname.replace(/\/+$/, '');
  const hash = urlObj.hash.startsWith('#') ? urlObj.hash.slice(1) : urlObj.hash;

  // Format 1 & 2: /folder/<id>#<key> or /folder/<id>#<key>/file/<nodeId>
  const folderMatch = pathname.match(/^\/folder\/([A-Za-z0-9_-]+)$/);
  if (folderMatch) {
    const handleId = folderMatch[1];
    const subFileMatch = hash.match(/^([A-Za-z0-9_-]+)(?:\/file\/([A-Za-z0-9_-]+))?$/);
    if (!subFileMatch || !subFileMatch[1] || subFileMatch[1].length < 8) {
      return {
        isValid: false,
        normalizedUrl: '',
        sourceType: 'folder',
        handleId,
        key: '',
        cacheKey: '',
        error: 'Missing or malformed decryption key in Mega folder URL.',
      };
    }
    const key = subFileMatch[1];
    const specificNodeId = subFileMatch[2];
    const normalizedUrl = specificNodeId
      ? `https://mega.nz/folder/${handleId}#${key}/file/${specificNodeId}`
      : `https://mega.nz/folder/${handleId}#${key}`;

    return {
      isValid: true,
      normalizedUrl,
      sourceType: 'folder',
      handleId,
      key,
      specificNodeId,
      cacheKey: `mega:folder:${handleId}:${specificNodeId || 'root'}`,
    };
  }

  // Format 3: /file/<id>#<key>
  const fileMatch = pathname.match(/^\/file\/([A-Za-z0-9_-]+)$/);
  if (fileMatch) {
    const handleId = fileMatch[1];
    const keyMatch = hash.match(/^([A-Za-z0-9_-]+)$/);
    if (!keyMatch || !keyMatch[1] || keyMatch[1].length < 8) {
      return {
        isValid: false,
        normalizedUrl: '',
        sourceType: 'file',
        handleId,
        key: '',
        cacheKey: '',
        error: 'Missing or malformed decryption key in Mega file URL.',
      };
    }
    const key = keyMatch[1];
    const normalizedUrl = `https://mega.nz/file/${handleId}#${key}`;
    return {
      isValid: true,
      normalizedUrl,
      sourceType: 'file',
      handleId,
      key,
      cacheKey: `mega:file:${handleId}`,
    };
  }

  // Format 4: /#F!<id>!<key> (Legacy Folder URL)
  const legacyFolderMatch = hash.match(/^F!([A-Za-z0-9_-]+)!([A-Za-z0-9_-]+)(?:!([A-Za-z0-9_-]+))?$/);
  if (legacyFolderMatch) {
    const handleId = legacyFolderMatch[1];
    const key = legacyFolderMatch[2];
    const specificNodeId = legacyFolderMatch[3];
    if (key.length < 8) {
      return {
        isValid: false,
        normalizedUrl: '',
        sourceType: 'folder',
        handleId,
        key: '',
        cacheKey: '',
        error: 'Legacy folder key is too short.',
      };
    }
    const normalizedUrl = specificNodeId
      ? `https://mega.nz/folder/${handleId}#${key}/file/${specificNodeId}`
      : `https://mega.nz/folder/${handleId}#${key}`;
    return {
      isValid: true,
      normalizedUrl,
      sourceType: 'folder',
      handleId,
      key,
      specificNodeId,
      cacheKey: `mega:folder:${handleId}:${specificNodeId || 'root'}`,
    };
  }

  // Format 5: /#!<id>!<key> (Legacy File URL)
  const legacyFileMatch = hash.match(/^!([A-Za-z0-9_-]+)!([A-Za-z0-9_-]+)$/);
  if (legacyFileMatch) {
    const handleId = legacyFileMatch[1];
    const key = legacyFileMatch[2];
    if (key.length < 8) {
      return {
        isValid: false,
        normalizedUrl: '',
        sourceType: 'file',
        handleId,
        key: '',
        cacheKey: '',
        error: 'Legacy file key is too short.',
      };
    }
    const normalizedUrl = `https://mega.nz/file/${handleId}#${key}`;
    return {
      isValid: true,
      normalizedUrl,
      sourceType: 'file',
      handleId,
      key,
      cacheKey: `mega:file:${handleId}`,
    };
  }

  return {
    isValid: false,
    normalizedUrl: '',
    sourceType: 'folder',
    handleId: '',
    key: '',
    cacheKey: '',
    error: 'Unsupported Mega.nz URL path or hash format.',
  };
}

/**
 * Detects if a filename is a supported video format and returns its extension and MIME type.
 */
export function detectVideoFormat(fileName: string): {
  isVideo: boolean;
  extension: string;
  mimeType: string;
} {
  const cleanName = (fileName || '').trim();
  const lastDot = cleanName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === cleanName.length - 1) {
    return { isVideo: false, extension: '', mimeType: '' };
  }
  const ext = cleanName.slice(lastDot + 1).toLowerCase();
  const mimeType = VIDEO_MIME_MAP[ext];
  if (!mimeType) {
    return { isVideo: false, extension: ext, mimeType: '' };
  }
  return { isVideo: true, extension: ext, mimeType };
}

/**
 * Removes unnecessary technical metadata from video filenames while preserving
 * meaningful titles, years, and episode identifiers (e.g., S01E02, Ep 04).
 */
export function cleanVideoFileName(rawFileName: string): {
  title: string;
  episodeLabel?: string;
} {
  if (!rawFileName) return { title: 'Untitled Video' };

  // Strip extension if it's a known video extension
  let working = rawFileName.trim();
  const lastDot = working.lastIndexOf('.');
  if (lastDot > 0) {
    const ext = working.slice(lastDot + 1).toLowerCase();
    if (VIDEO_MIME_MAP[ext]) {
      working = working.slice(0, lastDot);
    }
  }

  // Extract episode identifier if present before stripping brackets
  let episodeLabel: string | undefined;
  const epMatch = working.match(/\b(S\d{1,2}E\d{1,3}|Season\s*\d+\s*Episode\s*\d+|Ep\.?\s*\d{1,3}|E\d{2,3})\b/i);
  if (epMatch) {
    episodeLabel = epMatch[1].toUpperCase().replace(/\s+/g, ' ');
  }

  // Remove bracketed release tags like [1080p], [SubGroup], (WEB-DL), {x265}
  // Keep 4-digit release years in parentheses if meaningful, or restore them
  const yearMatch = working.match(/\b(19\d{2}|20\d{2})\b/);
  working = working
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ');

  // Remove parenthesized noise tags (resolutions, codecs, audio)
  working = working.replace(/\(([^)]*)\)/g, (full, inner) => {
    if (/^(19\d{2}|20\d{2})$/.test(inner.trim())) {
      return `(${inner.trim()})`;
    }
    return ' ';
  });

  // Replace dots and underscores with spaces
  working = working.replace(/[._]+/g, ' ');

  // Remove common encoding/release tokens
  const noiseTokens = [
    /\b(2160p|1440p|1080p|1080i|720p|480p|360p|4K|UHD|FHD|HD)\b/gi,
    /\b(WEB-DL|WEBDL|WEBRip|BluRay|BRRip|BDRip|DVDRip|HDTV|HDRip|CAMRip|REMUX)\b/gi,
    /\b(x264|x265|H\s*264|H\s*265|HEVC|AVC|AV1|XviD|DivX|10bit|8bit|HDR10|HDR|DV|Dolby\s*Vision)\b/gi,
    /\b(AAC|AAC2\s*0|AC3|EAC3|DDP5\s*1|DD5\s*1|DTS|FLAC|MP3|Atmos|TrueHD|Dual\s*Audio|Multi\s*Sub)\b/gi,
    /\b(PROPER|REPACK|EXTENDED|UNRATED|DIRECTORS\s*CUT|YIFY|YTS|RARBG|PSA|TGx|AMZN|NF|DSNP|HMAX|ATVP)\b/gi,
  ];

  for (const regex of noiseTokens) {
    working = working.replace(regex, ' ');
  }

  // Collapse multiple dashes and whitespace
  working = working
    .replace(/\s+-\s+-+/g, ' - ')
    .replace(/[-–—]+\s*$/g, '')
    .replace(/^\s*[-–—]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!working && yearMatch) {
    working = `Feature Film (${yearMatch[1]})`;
  }

  return {
    title: working || 'Untitled Video',
    episodeLabel,
  };
}

/**
 * Applies a custom administrator regex pattern and replacement safely.
 */
export function applyCustomRegexTrim(
  inputName: string,
  pattern: string,
  replacement: string,
  flags = 'gi'
): { result: string; isValidRegex: boolean; error?: string } {
  if (!pattern) {
    return { result: inputName, isValidRegex: true };
  }
  try {
    const safeFlags = flags.replace(/[^gimsuy]/g, '') || 'g';
    const regex = new RegExp(pattern, safeFlags);
    const replaced = inputName
      .replace(regex, replacement)
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      result: replaced || inputName,
      isValidRegex: true,
    };
  } catch (err) {
    return {
      result: inputName,
      isValidRegex: false,
      error: err instanceof Error ? err.message : 'Invalid regular expression',
    };
  }
}

/**
 * Infers a cinema genre from a folder or file name.
 */
export function inferGenreFromName(name: string): CinemaGenre {
  const lower = (name || '').toLowerCase();

  if (/\b(sci-fi|scifi|science fiction|cyberpunk|space|cosmos|orbital|SOLARIS|alien|future|galaxy|mars)\b/i.test(lower)) {
    return 'Sci-Fi';
  }
  if (/\b(docu|documentary|nature|history|planet|earth|archive|biography|chronicle|expedition|wildlife)\b/i.test(lower)) {
    return 'Documentary';
  }
  if (/\b(action|combat|chase|velocity|strike|warfare|mission|tactical|apex|heist)\b/i.test(lower)) {
    return 'Action';
  }
  if (/\b(noir|mystery|detective|thriller|crime|shadow|midnight|enigma|suspect|cipher)\b/i.test(lower)) {
    return 'Noir & Mystery';
  }
  if (/\b(anime|animation|animated|studio|cartoon|pixar|ghibli|2d|3d|mecha|cel)\b/i.test(lower)) {
    return 'Animation';
  }
  if (/\b(horror|terror|haunted|nightmare|occult|dread|ghost|slasher|creepy)\b/i.test(lower)) {
    return 'Horror';
  }
  if (/\b(comedy|sitcom|humor|standup|laugh|satire|parody|improv)\b/i.test(lower)) {
    return 'Comedy';
  }
  if (/\b(drama|indie|festival|arthouse|cinema|romance|story|chronicles|portrait)\b/i.test(lower)) {
    return 'Drama & Indie';
  }

  return 'Drama & Indie';
}

/**
 * Generates a deterministic opaque video ID (`vid-xxxxxxxxxxxx`) from rootUrl and nodeId
 * so raw Mega filenames or keys are never exposed in `/watch/vid-...` routes.
 */
export function generateOpaqueVideoId(rootUrl: string, nodeId: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${rootUrl.trim()}::${nodeId.trim()}`)
    .digest('base64url')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `vid-${digest.slice(0, 12)}`;
}

/**
 * Parses an HTTP Range header (`bytes=start-end`) against a total file size in bytes.
 */
export interface ByteRangeParseResult {
  isRangeRequest: boolean;
  isSatisfiable: boolean;
  start: number;
  end: number;
  contentLength: number;
}

export function parseHttpByteRange(
  rangeHeader: string | null | undefined,
  totalSizeBytes: number
): ByteRangeParseResult {
  if (totalSizeBytes <= 0) {
    return {
      isRangeRequest: Boolean(rangeHeader),
      isSatisfiable: false,
      start: 0,
      end: 0,
      contentLength: 0,
    };
  }

  if (!rangeHeader || !rangeHeader.trim()) {
    return {
      isRangeRequest: false,
      isSatisfiable: true,
      start: 0,
      end: totalSizeBytes - 1,
      contentLength: totalSizeBytes,
    };
  }

  const match = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) {
    return {
      isRangeRequest: true,
      isSatisfiable: false,
      start: 0,
      end: -1,
      contentLength: 0,
    };
  }

  const startStr = match[1];
  const endStr = match[2];

  if (startStr === '' && endStr === '') {
    return {
      isRangeRequest: true,
      isSatisfiable: false,
      start: 0,
      end: -1,
      contentLength: 0,
    };
  }

  let start: number;
  let end: number;

  if (startStr === '') {
    // Suffix range: bytes=-500 (last 500 bytes)
    const suffixLength = parseInt(endStr, 10);
    if (isNaN(suffixLength) || suffixLength <= 0) {
      return {
        isRangeRequest: true,
        isSatisfiable: false,
        start: 0,
        end: -1,
        contentLength: 0,
      };
    }
    start = Math.max(0, totalSizeBytes - suffixLength);
    end = totalSizeBytes - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr !== '' ? parseInt(endStr, 10) : totalSizeBytes - 1;
  }

  if (
    isNaN(start) ||
    isNaN(end) ||
    start < 0 ||
    start >= totalSizeBytes ||
    start > end
  ) {
    return {
      isRangeRequest: true,
      isSatisfiable: false,
      start: 0,
      end: -1,
      contentLength: 0,
    };
  }

  end = Math.min(end, totalSizeBytes - 1);
  return {
    isRangeRequest: true,
    isSatisfiable: true,
    start,
    end,
    contentLength: end - start + 1,
  };
}

/**
 * Mega.nz AES-128-CTR Cryptography Helpers
 *
 * Mega file keys are 256-bit (32-byte) arrays where:
 * - AES-128 key = first 16 bytes XOR last 16 bytes
 * - Initial CTR IV (16 bytes) = bytes 16..23 of the 32-byte key followed by 8 zero bytes (64-bit big-endian block counter)
 */
export function deriveMegaAesKeyAndIv(nodeKey32Bytes: Buffer): {
  aesKey16: Buffer;
  baseIv16: Buffer;
} {
  if (nodeKey32Bytes.length === 16) {
    // Already unpacked 16-byte key
    return {
      aesKey16: Buffer.from(nodeKey32Bytes),
      baseIv16: Buffer.alloc(16, 0),
    };
  }
  if (nodeKey32Bytes.length < 32) {
    throw new Error(`Invalid Mega node key length: expected 32 bytes, got ${nodeKey32Bytes.length}`);
  }
  const aesKey16 = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    aesKey16[i] = nodeKey32Bytes[i] ^ nodeKey32Bytes[i + 16];
  }
  const baseIv16 = Buffer.alloc(16, 0);
  // Copy nonce (bytes 16..23 of original 32-byte key) into first 8 bytes of IV
  nodeKey32Bytes.copy(baseIv16, 0, 16, 24);
  return { aesKey16, baseIv16 };
}

/**
 * Computes the 16-byte AES-CTR counter block for an arbitrary 16-byte block offset.
 */
export function computeAesCtrIvForBlock(baseIv16: Buffer, blockIndex: bigint): Buffer {
  const iv = Buffer.from(baseIv16);
  const existingCounter = iv.readBigUInt64BE(8);
  iv.writeBigUInt64BE(existingCounter + blockIndex, 8);
  return iv;
}

/**
 * Aligns an arbitrary byte range [start, end] to 16-byte AES-128-CTR block boundaries,
 * decrypts the aligned ciphertext buffer, and slices out the exact requested range.
 */
export function computeAlignedAesRange(startByte: number, endByte: number): {
  alignedStart: number;
  alignedEnd: number;
  startBlockIndex: bigint;
  sliceOffset: number;
  sliceLength: number;
} {
  const alignedStart = Math.floor(startByte / 16) * 16;
  const alignedEnd = Math.ceil((endByte + 1) / 16) * 16 - 1;
  const startBlockIndex = BigInt(Math.floor(alignedStart / 16));
  const sliceOffset = startByte - alignedStart;
  const sliceLength = endByte - startByte + 1;

  return {
    alignedStart,
    alignedEnd,
    startBlockIndex,
    sliceOffset,
    sliceLength,
  };
}

export function decryptMegaAesCtrAlignedBuffer(
  alignedCiphertext: Buffer,
  nodeKey32Bytes: Buffer,
  startByte: number,
  endByte: number
): Buffer {
  const { aesKey16, baseIv16 } = deriveMegaAesKeyAndIv(nodeKey32Bytes);
  const { startBlockIndex, sliceOffset, sliceLength } = computeAlignedAesRange(startByte, endByte);
  const iv = computeAesCtrIvForBlock(baseIv16, startBlockIndex);
  const decipher = crypto.createDecipheriv('aes-128-ctr', aesKey16, iv);
  decipher.setAutoPadding(false);
  const decryptedAligned = Buffer.concat([
    decipher.update(alignedCiphertext),
    decipher.final(),
  ]);
  return decryptedAligned.subarray(sliceOffset, sliceOffset + sliceLength);
}
