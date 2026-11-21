// ============================================================================
// CineMega — Comprehensive Unit & Integration Test Suite (`node:test`)
// ============================================================================
// Covers all 13 required verification areas:
// 1. Mega URL parsing (all 5 URL formats)
// 2. URL validation & domain security checks
// 3. Video detection & Filename cleaning
// 4. Custom regex trimming & safe invalid-regex handling
// 5. Opaque video ID generation (`vid-xxxxxxxxxxxx`)
// 6. HTTP Range parsing & AES-128-CTR aligned block decryption
// 7. Stream response headers (206 Partial Content, Content-Range, HEAD, 416)
// 8. API routing & shared coreHandler endpoints
// 9. Worker pool health-aware selection & automatic failover
// 10. Cache expiration & selective invalidation
// 11. On-demand 30-second thumbnail queue singleton
// 12. Admin authentication (scrypt hashing, HMAC sessions, protected routes)
// 13. API response handling (watch states, favorites, analytics)

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  createAdminSessionToken,
  hashPasswordScrypt,
  verifyAdminSessionToken,
  verifyPasswordScrypt,
} from '../api/authUtils';
import { handleApiRequest } from '../api/coreHandler';
import {
  applyCustomRegexTrim,
  cleanVideoFileName,
  computeAlignedAesRange,
  decryptMegaAesCtrAlignedBuffer,
  deriveMegaAesKeyAndIv,
  detectVideoFormat,
  generateOpaqueVideoId,
  inferGenreFromName,
  parseHttpByteRange,
  parseMegaUrl,
} from '../api/megaUtils';
import { CineMegaDatabase } from '../api/supabaseStore';
import { ApiWorkerPool } from '../utils/apiBase';
import {
  ON_DEMAND_THUMBNAIL_DELAY_MS,
  thumbnailQueue,
} from '../utils/thumbnailGenerator';

test('1 & 2. Mega URL Parsing & Security Validation across all 5 supported formats', () => {
  // Format 1: Modern folder URL
  const f1 = parseMegaUrl('https://mega.nz/folder/AbCdEfGh#1234567890abcdef');
  assert.equal(f1.isValid, true);
  assert.equal(f1.sourceType, 'folder');
  assert.equal(f1.handleId, 'AbCdEfGh');
  assert.equal(f1.key, '1234567890abcdef');
  assert.equal(f1.normalizedUrl, 'https://mega.nz/folder/AbCdEfGh#1234567890abcdef');

  // Format 2: Folder URL with specific file nodeId
  const f2 = parseMegaUrl('https://mega.nz/folder/AbCdEfGh#1234567890abcdef/file/Node9876');
  assert.equal(f2.isValid, true);
  assert.equal(f2.sourceType, 'folder');
  assert.equal(f2.specificNodeId, 'Node9876');
  assert.equal(
    f2.normalizedUrl,
    'https://mega.nz/folder/AbCdEfGh#1234567890abcdef/file/Node9876'
  );

  // Format 3: Modern file URL
  const f3 = parseMegaUrl('https://mega.nz/file/XyZwVuTs#KeyFile123456789');
  assert.equal(f3.isValid, true);
  assert.equal(f3.sourceType, 'file');
  assert.equal(f3.handleId, 'XyZwVuTs');
  assert.equal(f3.normalizedUrl, 'https://mega.nz/file/XyZwVuTs#KeyFile123456789');

  // Format 4: Legacy folder URL (#F!id!key)
  const f4 = parseMegaUrl('https://mega.nz/#F!LegacyId!LegacyKey123456');
  assert.equal(f4.isValid, true);
  assert.equal(f4.sourceType, 'folder');
  assert.equal(f4.normalizedUrl, 'https://mega.nz/folder/LegacyId#LegacyKey123456');

  // Format 5: Legacy file URL (#!id!key)
  const f5 = parseMegaUrl('https://mega.nz/#!FileId99!FileKey99887766');
  assert.equal(f5.isValid, true);
  assert.equal(f5.sourceType, 'file');
  assert.equal(f5.normalizedUrl, 'https://mega.nz/file/FileId99#FileKey99887766');

  // Invalid / non-Mega domain rejection (SSRF guard)
  const badDomain = parseMegaUrl('https://evil.example.com/folder/AbCdEfGh#1234567890');
  assert.equal(badDomain.isValid, false);

  const missingKey = parseMegaUrl('https://mega.nz/folder/AbCdEfGh');
  assert.equal(missingKey.isValid, false);
});

test('3. Video Detection, Filename Cleaning & Genre Detection', () => {
  const mp4Check = detectVideoFormat('Movie.2026.1080p.WEB-DL.x265.mp4');
  assert.equal(mp4Check.isVideo, true);
  assert.equal(mp4Check.extension, 'mp4');
  assert.equal(mp4Check.mimeType, 'video/mp4');

  const mkvCheck = detectVideoFormat('Episode.mkv');
  assert.equal(mkvCheck.isVideo, true);
  assert.equal(mkvCheck.mimeType, 'video/x-matroska');

  const txtCheck = detectVideoFormat('readme.txt');
  assert.equal(txtCheck.isVideo, false);

  const cleaned = cleanVideoFileName(
    '[SubGroup] Solaris_Orbital_Odyssey.2026.S01E04.1080p.WEB-DL.x265.HEVC.AAC-RARBG.mp4'
  );
  assert.equal(cleaned.title, 'Solaris Orbital Odyssey 2026 S01E04');
  assert.equal(cleaned.episodeLabel, 'S01E04');

  assert.equal(inferGenreFromName('Solaris Cyberpunk Space Archive'), 'Sci-Fi');
  assert.equal(inferGenreFromName('Midnight Detective Noir Files'), 'Noir & Mystery');
  assert.equal(inferGenreFromName('Planet Wildlife Documentary'), 'Documentary');
});

test('4. Custom Regex Filename Trimming & Safe Invalid Regex Handling', () => {
  const validTrim = applyCustomRegexTrim(
    'Solaris Odyssey 2026 S01E01',
    '\\b2026\\b',
    '(Director Cut)'
  );
  assert.equal(validTrim.isValidRegex, true);
  assert.equal(validTrim.result, 'Solaris Odyssey (Director Cut) S01E01');

  const invalidTrim = applyCustomRegexTrim('Solaris Odyssey', '[unclosed group', '');
  assert.equal(invalidTrim.isValidRegex, false);
  assert.equal(invalidTrim.result, 'Solaris Odyssey');
  assert.ok(invalidTrim.error);
});

test('5. Opaque Video ID Generation (`vid-xxxxxxxxxxxx`)', () => {
  const id1 = generateOpaqueVideoId(
    'https://mega.nz/folder/AbCdEfGh#Key123456',
    'node-01'
  );
  const id2 = generateOpaqueVideoId(
    'https://mega.nz/folder/AbCdEfGh#Key123456',
    'node-01'
  );
  const id3 = generateOpaqueVideoId(
    'https://mega.nz/folder/AbCdEfGh#Key123456',
    'node-02'
  );

  assert.match(id1, /^vid-[a-z0-9]{12}$/);
  assert.equal(id1, id2);
  assert.notEqual(id1, id3);
});

test('6. HTTP Byte-Range Parsing & Mega AES-128-CTR Block-Aligned Decryption', () => {
  const r1 = parseHttpByteRange('bytes=0-1023', 5000);
  assert.equal(r1.isRangeRequest, true);
  assert.equal(r1.isSatisfiable, true);
  assert.equal(r1.start, 0);
  assert.equal(r1.end, 1023);
  assert.equal(r1.contentLength, 1024);

  // Open-ended range
  const r2 = parseHttpByteRange('bytes=1000-', 5000);
  assert.equal(r2.isSatisfiable, true);
  assert.equal(r2.start, 1000);
  assert.equal(r2.end, 4999);
  assert.equal(r2.contentLength, 4000);

  // Out-of-bounds range -> 416
  const rInvalid = parseHttpByteRange('bytes=6000-7000', 5000);
  assert.equal(rInvalid.isSatisfiable, false);

  // Test AES-128-CTR unaligned byte-range decryption math
  const nodeKey32 = crypto.randomBytes(32);
  const { aesKey16, baseIv16 } = deriveMegaAesKeyAndIv(nodeKey32);
  const plaintext = Buffer.from(
    'CineMega AES-128-CTR Byte-Range Streaming Verification Payload! '.repeat(8),
    'utf8'
  );

  // Encrypt full payload starting at block 0
  const cipher = crypto.createCipheriv('aes-128-ctr', aesKey16, baseIv16);
  const fullCiphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  // Request an unaligned slice [19..93]
  const startByte = 19;
  const endByte = 93;
  const { alignedStart, alignedEnd } = computeAlignedAesRange(startByte, endByte);
  const alignedCipherSlice = fullCiphertext.subarray(alignedStart, alignedEnd + 1);

  const decryptedRange = decryptMegaAesCtrAlignedBuffer(
    alignedCipherSlice,
    nodeKey32,
    startByte,
    endByte
  );

  assert.deepEqual(decryptedRange, plaintext.subarray(startByte, endByte + 1));
});

test('7 & 8. Shared CoreHandler API Routing, Health, and HTTP 206/416 Stream Headers', async () => {
  // Health check
  const healthReq = new Request('http://localhost:3000/api/health', { method: 'GET' });
  const healthRes = await handleApiRequest(healthReq, {
    platform: 'Cloudflare Workers',
  });
  assert.equal(healthRes.status, 200);
  const healthBody = await healthRes.json();
  assert.equal(healthBody.platform, 'Cloudflare Workers');
  assert.equal(healthBody.status, 'healthy');

  // Library folders catalog
  const foldersReq = new Request('http://localhost:3000/api/folders', { method: 'GET' });
  const foldersRes = await handleApiRequest(foldersReq);
  assert.equal(foldersRes.status, 200);
  const foldersData = await foldersRes.json();
  assert.ok(Array.isArray(foldersData.folders));
  assert.ok(foldersData.folders.length >= 3);

  const sampleVideoId = foldersData.folders[0].videos[0].id;

  // Stream GET with Range header -> 206 Partial Content
  const streamReq = new Request(
    `http://localhost:3000/api/mega/stream?videoId=${encodeURIComponent(sampleVideoId)}`,
    {
      method: 'GET',
      headers: { Range: 'bytes=0-127' },
    }
  );
  const streamRes = await handleApiRequest(streamReq);
  assert.equal(streamRes.status, 206);
  assert.equal(streamRes.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(streamRes.headers.get('Content-Length'), '128');
  assert.match(streamRes.headers.get('Content-Range') || '', /^bytes 0-127\/\d+$/);
  const buf = await streamRes.arrayBuffer();
  assert.equal(buf.byteLength, 128);

  // Stream HEAD request
  const headReq = new Request(
    `http://localhost:3000/api/mega/stream?videoId=${encodeURIComponent(sampleVideoId)}`,
    {
      method: 'HEAD',
      headers: { Range: 'bytes=0-63' },
    }
  );
  const headRes = await handleApiRequest(headReq);
  assert.equal(headRes.status, 206);
  assert.equal(headRes.headers.get('Content-Length'), '64');

  // Stream invalid range -> 416 Range Not Satisfiable
  const badRangeReq = new Request(
    `http://localhost:3000/api/mega/stream?videoId=${encodeURIComponent(sampleVideoId)}`,
    {
      method: 'GET',
      headers: { Range: 'bytes=999999999-9999999999' },
    }
  );
  const badRangeRes = await handleApiRequest(badRangeReq);
  assert.equal(badRangeRes.status, 416);
});

test('9. Distributed Frontend Worker Pool Round-Robin & Automatic Failover', async () => {
  const pool = new ApiWorkerPool({
    workerUrlsCsv: 'https://worker-a.example.com,https://worker-b.example.com',
  });

  const w1 = pool.selectHealthyWorker();
  const w2 = pool.selectHealthyWorker();
  assert.equal(w1.baseUrl, 'https://worker-a.example.com');
  assert.equal(w2.baseUrl, 'https://worker-b.example.com');

  // Simulate worker-a returning HTTP 503 and worker-b succeeding
  let calls = 0;
  const mockFetch = (async (input: RequestInfo | URL): Promise<Response> => {
    calls += 1;
    const urlStr = String(input);
    if (urlStr.startsWith('https://worker-a.example.com')) {
      return new Response(JSON.stringify({ error: 'Worker A overloaded' }), {
        status: 503,
      });
    }
    return new Response(JSON.stringify({ ok: true, servedBy: 'worker-b' }), {
      status: 200,
    });
  }) as typeof fetch;

  const result = await pool.fetchApi<{ ok: boolean; servedBy: string }>(
    '/api/folders',
    {},
    mockFetch
  );
  assert.equal(result.ok, true);
  assert.equal(result.servedBy, 'worker-b');
  assert.equal(calls, 2);

  // Verify worker-a is now in cooldown and selectHealthyWorker avoids it
  const snap = pool.getWorkersSnapshot();
  const nodeA = snap.find((n) => n.baseUrl === 'https://worker-a.example.com');
  assert.equal(nodeA?.healthy, false);
  assert.equal(pool.selectHealthyWorker().baseUrl, 'https://worker-b.example.com');
});

test('10. Cache Expiration & Selective Cache Clearing', async () => {
  const db = new CineMegaDatabase();
  const now = Date.now();

  // Save an expired inspect cache entry
  await db.setInspectCache({
    cacheKey: 'mega:folder:expired123:root',
    folderName: 'Expired Folder',
    suggestedGenre: 'Sci-Fi',
    sourceType: 'folder',
    megaUrl: 'https://mega.nz/folder/expired123#key12345678',
    totalSizeBytes: 1000,
    videos: [],
    cachedAt: now - 10000,
    expiresAt: now - 1, // already expired
  });

  const expiredRead = await db.getInspectCache('mega:folder:expired123:root');
  assert.equal(expiredRead, null);

  // Save a valid inspect cache entry and clear it via clearCaches
  await db.setInspectCache({
    cacheKey: 'mega:folder:valid123:root',
    folderName: 'Valid Folder',
    suggestedGenre: 'Sci-Fi',
    sourceType: 'folder',
    megaUrl: 'https://mega.nz/folder/valid123#key12345678',
    totalSizeBytes: 1000,
    videos: [],
    cachedAt: now,
    expiresAt: now + 60000,
  });

  const validRead = await db.getInspectCache('mega:folder:valid123:root');
  assert.equal(validRead?.folderName, 'Valid Folder');

  await db.clearCaches(['inspect_cache']);
  const afterClear = await db.getInspectCache('mega:folder:valid123:root');
  assert.equal(afterClear, null);
});

test('11. On-Demand 30-Second Thumbnail Queue Singleton', () => {
  assert.equal(ON_DEMAND_THUMBNAIL_DELAY_MS, 30_000);
  assert.equal(thumbnailQueue.getQueueDelayMs(), 30_000);

  thumbnailQueue.resetForTest();
  const sampleVideo = {
    id: 'vid-testqueue123',
    folderId: 'fld-1',
    title: 'Queue Test Video',
    rawFileName: 'Queue.Test.mp4',
    cleanedFileName: 'Queue Test Video',
    sizeBytes: 1024,
    mimeType: 'video/mp4',
    extension: 'mp4',
    nodeId: 'n1',
    rootUrl: 'https://mega.nz/folder/AbCdEfGh#1234567890',
    addedAt: Date.now(),
  };

  assert.equal(thumbnailQueue.getStatusForVideo(sampleVideo), 'Temp Thumbnail');
});

test('12 & 13. Admin Authentication (Scrypt + HMAC Session) & Watch States API', async () => {
  const { salt, hash } = hashPasswordScrypt('CinemaMasterPass!2026');
  assert.equal(verifyPasswordScrypt('CinemaMasterPass!2026', salt, hash), true);
  assert.equal(verifyPasswordScrypt('WrongPassword', salt, hash), false);

  const token = createAdminSessionToken(
    { username: 'cinema_admin', email: 'admin@cinemega.local' },
    'test-session-secret-key-32-chars-minimum'
  );
  const verified = verifyAdminSessionToken(
    token,
    'test-session-secret-key-32-chars-minimum'
  );
  assert.equal(verified?.username, 'cinema_admin');

  // Test protected route rejects unauthenticated request
  const unauthInspect = new Request('http://localhost:3000/api/mega/inspect', {
    method: 'POST',
    body: JSON.stringify({
      megaUrl: 'https://mega.nz/folder/AbCdEfGh#1234567890abcdef',
    }),
  });
  const unauthRes = await handleApiRequest(unauthInspect);
  assert.equal(unauthRes.status, 401);

  // Test Watch States PUT and GET
  const putWatchReq = new Request('http://localhost:3000/api/watch-states/vid-unit123456', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Viewer-Key': 'viewer-unit-test',
    },
    body: JSON.stringify({
      folderId: 'fld-solaris-odyssey',
      positionSec: 145,
      durationSec: 600,
      favorite: true,
    }),
  });
  const putWatchRes = await handleApiRequest(putWatchReq);
  assert.equal(putWatchRes.status, 200);

  const getWatchReq = new Request('http://localhost:3000/api/watch-states', {
    method: 'GET',
    headers: { 'X-Viewer-Key': 'viewer-unit-test' },
  });
  const getWatchRes = await handleApiRequest(getWatchReq);
  assert.equal(getWatchRes.status, 200);
  const watchData = await getWatchRes.json();
  assert.equal(watchData.watchStates.length, 1);
  assert.equal(watchData.watchStates[0].positionSec, 145);
  assert.equal(watchData.watchStates[0].favorite, true);
});
