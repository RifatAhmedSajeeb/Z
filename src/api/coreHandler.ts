// ============================================================================
// CineMega — Shared Platform-Agnostic Backend Core (`Request -> Promise<Response>`)
// ============================================================================
// Shared across Cloudflare Workers (`src/worker.ts`), Vercel Functions (`api/[...route].ts`),
// Netlify Functions (`netlify/functions/api.ts`), and Local Node.js (`server.ts`).

import type {
  AdminStatsResponse,
  LibraryFolder,
  VideoItem,
  WorkerHealthReport,
} from '../types/cinemega';
import {
  buildSessionCookieHeader,
  createAdminSessionToken,
  extractAdminTokenFromRequest,
  hashPasswordScrypt,
  verifyAdminSessionToken,
  verifyPasswordScrypt,
} from './authUtils';
import { handleMegaVideoStream, inspectMegaLink } from './megaEngine';
import {
  applyCustomRegexTrim,
  cleanVideoFileName,
  generateOpaqueVideoId,
  inferGenreFromName,
  parseMegaUrl,
} from './megaUtils';
import { CineMegaDatabase, type EnvVars } from './supabaseStore';

export interface CoreHandlerContext {
  platform?: WorkerHealthReport['platform'];
  env?: EnvVars;
}

const workerStartTime = Date.now();
let totalRequestsHandled = 0;

// Simple rate limiter for admin login attempts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(clientKey: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(clientKey);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(clientKey, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 15;
}

/**
 * Generates a rich SVG-backed cinema frame data URL for server-side admin thumbnail generation.
 */
function generateServerCinemaThumbnailBase64(title: string, genre: string): {
  mimeType: string;
  base64Data: string;
} {
  const safeTitle = (title || 'CineMega Feature')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 42);
  const safeGenre = (genre || 'Cinema')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 24);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#111115" />
        <stop offset="55%" stop-color="#18181f" />
        <stop offset="100%" stop-color="#271b0c" />
      </linearGradient>
      <radialGradient id="glow" cx="80%" cy="20%" r="60%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#0a0a0b" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg)" />
    <rect width="640" height="360" fill="url(#glow)" />
    <g stroke="#ffffff" stroke-opacity="0.06" stroke-width="1">
      <line x1="0" y1="48" x2="640" y2="48" />
      <line x1="0" y1="312" x2="640" y2="312" />
    </g>
    <text x="36" y="88" fill="#f59e0b" font-family="sans-serif" font-size="13" font-weight="600" letter-spacing="1.5">${safeGenre.toUpperCase()} · MASTER FRAME</text>
    <text x="36" y="264" fill="#f4f4f5" font-family="sans-serif" font-size="24" font-weight="700">${safeTitle}</text>
    <text x="36" y="292" fill="#a1a1aa" font-family="monospace" font-size="12">AES-128-CTR · VERIFIED THUMBNAIL</text>
  </svg>`;

  return {
    mimeType: 'image/svg+xml',
    base64Data: Buffer.from(svg, 'utf8').toString('base64'),
  };
}

/**
 * Builds CORS headers safely. Never uses wildcard `*` for authenticated admin endpoints
 * when an explicit Origin header is present.
 */
function buildCorsHeaders(
  req: Request,
  isAdminRoute: boolean,
  env?: EnvVars
): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowedCfg = env?.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, X-Viewer-Key, Range',
    'Access-Control-Expose-Headers':
      'Content-Range, Accept-Ranges, Content-Length, X-CineMega-Worker, X-CineMega-Cache',
  };

  if (isAdminRoute) {
    if (origin) {
      if (
        !allowedCfg ||
        allowedCfg === '*' ||
        allowedCfg.split(',').map((s) => s.trim()).includes(origin)
      ) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
        headers['Vary'] = 'Origin';
      }
    }
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private';
  } else {
    headers['Access-Control-Allow-Origin'] = origin || '*';
    if (origin) {
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers['Vary'] = 'Origin';
    }
  }

  return headers;
}

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

async function parseJsonBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Verifies if the incoming request is authenticated as an administrator.
 */
async function authenticateAdminRequest(
  req: Request,
  db: CineMegaDatabase,
  env?: EnvVars
): Promise<{
  authenticated: boolean;
  username?: string;
  email?: string;
  requiresSetup: boolean;
}> {
  const adminCfg = await db.getAdminConfig();
  const envPasscode = env?.ADMIN_PASSCODE || process.env.ADMIN_PASSCODE || '';
  const requiresSetup = !adminCfg && !envPasscode;

  const token = extractAdminTokenFromRequest(req);
  if (!token) {
    return { authenticated: false, requiresSetup };
  }

  const verified = verifyAdminSessionToken(token, env?.SESSION_SECRET);
  if (!verified) {
    return { authenticated: false, requiresSetup };
  }

  return {
    authenticated: true,
    username: verified.username,
    email: verified.email,
    requiresSetup: false,
  };
}

/**
 * Main platform-agnostic API handler: `Request -> Promise<Response>`
 */
export async function handleApiRequest(
  req: Request,
  context: CoreHandlerContext = {}
): Promise<Response> {
  totalRequestsHandled += 1;
  const platform: WorkerHealthReport['platform'] =
    context.platform || 'Local Node.js';
  const env = context.env;
  const db = new CineMegaDatabase(env);

  const url = new URL(req.url);
  // Normalize Netlify Function path prefix if invoked via /.netlify/functions/api/...
  const pathname = url.pathname
    .replace(/^\/\.netlify\/functions\/api/, '/api')
    .replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();
  const isAdminRoute = pathname.startsWith('/api/admin') || pathname === '/api/mega/inspect';

  const baseHeaders = {
    ...buildCorsHeaders(req, isAdminRoute, env),
    'X-CineMega-Worker': platform,
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  try {
    // ========================================================================
    // 1. GET /api/health
    // ========================================================================
    if (pathname === '/api/health' && method === 'GET') {
      const dbConn = await db.checkConnectivity();
      const summary = await db.getAnalyticsSummary();
      const uptimeSec = Math.floor((Date.now() - workerStartTime) / 1000);

      const report: WorkerHealthReport = {
        platform,
        status: dbConn.connected ? 'healthy' : 'degraded',
        database: dbConn,
        cache: {
          inspectEntries: summary.cacheStats.inspectCount,
          streamBlocks: summary.cacheStats.streamBlockCount,
          storageTickets: summary.cacheStats.ticketCount,
          nodeKeys: summary.cacheStats.nodeKeyCount,
          thumbnails: summary.cacheStats.thumbnailCount,
        },
        metrics: {
          uptimeSec,
          requestsHandled: totalRequestsHandled,
        },
        timestamp: Date.now(),
      };

      return jsonResponse(report, 200, {
        ...baseHeaders,
        'Cache-Control': 'no-store',
      });
    }

    // ========================================================================
    // 2. ADMIN AUTHENTICATION (/api/admin/me, /api/admin/login, /api/admin/logout, /api/admin/profile)
    // ========================================================================
    if (pathname === '/api/admin/me' && method === 'GET') {
      const auth = await authenticateAdminRequest(req, db, env);
      const cfg = await db.getAdminConfig();
      return jsonResponse(
        {
          authenticated: auth.authenticated,
          requiresSetup: auth.requiresSetup,
          user: auth.authenticated
            ? {
                username: cfg?.username || auth.username || 'admin',
                email: cfg?.email || auth.email || 'admin@cinemega.local',
                updatedAt: cfg?.updatedAt || Date.now(),
              }
            : null,
        },
        200,
        baseHeaders
      );
    }

    if (pathname === '/api/admin/login' && method === 'POST') {
      const clientIp =
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for') ||
        'local-client';
      if (!checkLoginRateLimit(clientIp)) {
        return jsonResponse(
          { error: 'Too many authentication attempts. Please wait 60 seconds.' },
          429,
          baseHeaders
        );
      }

      const body = await parseJsonBody<{
        identifier?: string;
        username?: string;
        email?: string;
        password?: string;
      }>(req);

      const identifier = (body.identifier || body.username || body.email || 'admin').trim();
      const password = (body.password || '').trim();

      if (!password || password.length < 4) {
        return jsonResponse(
          { error: 'Password must be at least 4 characters.' },
          400,
          baseHeaders
        );
      }

      const existingCfg = await db.getAdminConfig();
      const envPasscode = env?.ADMIN_PASSCODE || process.env.ADMIN_PASSCODE || '';

      // First-run atomic admin claim / setup if no admin_config exists and no ADMIN_PASSCODE is set
      if (!existingCfg && !envPasscode) {
        const hashed = hashPasswordScrypt(password);
        const initialUser =
          identifier.includes('@')
            ? identifier.split('@')[0]
            : identifier || env?.ADMIN_INITIAL_USERNAME || 'admin';
        const initialEmail =
          identifier.includes('@')
            ? identifier
            : body.email || env?.ADMIN_INITIAL_EMAIL || 'admin@cinemega.local';

        const saved = await db.saveAdminConfig({
          username: initialUser,
          email: initialEmail,
          passwordSalt: hashed.salt,
          passwordHash: hashed.hash,
          updatedAt: Date.now(),
        });

        const token = createAdminSessionToken(
          { username: saved.username, email: saved.email },
          env?.SESSION_SECRET
        );

        return jsonResponse(
          {
            authenticated: true,
            setupClaimed: true,
            token,
            user: {
              username: saved.username,
              email: saved.email,
              updatedAt: saved.updatedAt,
            },
          },
          200,
          {
            ...baseHeaders,
            'Set-Cookie': buildSessionCookieHeader(token),
          }
        );
      }

      // Check configured ADMIN_PASSCODE override if present
      let validCredentials = false;
      let resolvedUsername = existingCfg?.username || 'admin';
      let resolvedEmail = existingCfg?.email || 'admin@cinemega.local';

      if (envPasscode && password === envPasscode) {
        validCredentials = true;
      } else if (existingCfg) {
        const matchesUser =
          identifier.toLowerCase() === existingCfg.username.toLowerCase() ||
          identifier.toLowerCase() === existingCfg.email.toLowerCase();
        if (
          matchesUser &&
          verifyPasswordScrypt(password, existingCfg.passwordSalt, existingCfg.passwordHash)
        ) {
          validCredentials = true;
        }
      }

      if (!validCredentials) {
        return jsonResponse(
          { error: 'Invalid administrator credentials.' },
          401,
          baseHeaders
        );
      }

      const token = createAdminSessionToken(
        { username: resolvedUsername, email: resolvedEmail },
        env?.SESSION_SECRET
      );

      return jsonResponse(
        {
          authenticated: true,
          token,
          user: {
            username: resolvedUsername,
            email: resolvedEmail,
            updatedAt: existingCfg?.updatedAt || Date.now(),
          },
        },
        200,
        {
          ...baseHeaders,
          'Set-Cookie': buildSessionCookieHeader(token),
        }
      );
    }

    if (pathname === '/api/admin/logout' && method === 'POST') {
      return jsonResponse(
        { authenticated: false, loggedOut: true },
        200,
        {
          ...baseHeaders,
          'Set-Cookie': buildSessionCookieHeader('', true),
        }
      );
    }

    if (pathname === '/api/admin/profile' && method === 'POST') {
      const auth = await authenticateAdminRequest(req, db, env);
      if (!auth.authenticated) {
        return jsonResponse({ error: 'Unauthorized administrator session.' }, 401, baseHeaders);
      }

      const body = await parseJsonBody<{
        username?: string;
        email?: string;
        newPassword?: string;
      }>(req);

      const existing = await db.getAdminConfig();
      const nextUsername = (body.username || existing?.username || auth.username || 'admin').trim();
      const nextEmail = (body.email || existing?.email || auth.email || 'admin@cinemega.local').trim();

      if (!nextUsername || !nextEmail || !nextEmail.includes('@')) {
        return jsonResponse(
          { error: 'A valid username and email address are required.' },
          400,
          baseHeaders
        );
      }

      let passwordSalt = existing?.passwordSalt || '';
      let passwordHash = existing?.passwordHash || '';

      if (body.newPassword && body.newPassword.trim().length > 0) {
        if (body.newPassword.trim().length < 6) {
          return jsonResponse(
            { error: 'New password must be at least 6 characters.' },
            400,
            baseHeaders
          );
        }
        const hashed = hashPasswordScrypt(body.newPassword.trim());
        passwordSalt = hashed.salt;
        passwordHash = hashed.hash;
      } else if (!passwordSalt || !passwordHash) {
        const hashed = hashPasswordScrypt('admin123');
        passwordSalt = hashed.salt;
        passwordHash = hashed.hash;
      }

      const saved = await db.saveAdminConfig({
        username: nextUsername,
        email: nextEmail,
        passwordSalt,
        passwordHash,
        updatedAt: Date.now(),
      });

      const newToken = createAdminSessionToken(
        { username: saved.username, email: saved.email },
        env?.SESSION_SECRET
      );

      return jsonResponse(
        {
          updated: true,
          token: newToken,
          user: {
            username: saved.username,
            email: saved.email,
            updatedAt: saved.updatedAt,
          },
        },
        200,
        {
          ...baseHeaders,
          'Set-Cookie': buildSessionCookieHeader(newToken),
        }
      );
    }

    // ========================================================================
    // 3. LIBRARY CATALOG (/api/folders, /api/admin/folders, /api/admin/folders/:folderId)
    // ========================================================================
    if (pathname === '/api/folders' && method === 'GET') {
      const folders = await db.getLibraryFolders();
      return jsonResponse({ folders }, 200, {
        ...baseHeaders,
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
      });
    }

    if (pathname === '/api/admin/folders' && method === 'POST') {
      const auth = await authenticateAdminRequest(req, db, env);
      if (!auth.authenticated) {
        return jsonResponse({ error: 'Unauthorized administrator access.' }, 401, baseHeaders);
      }

      const body = await parseJsonBody<{
        id?: string;
        name?: string;
        description?: string;
        genre?: string;
        megaUrl?: string;
        sourceType?: 'folder' | 'file';
        videos?: VideoItem[];
        regexPattern?: string;
        regexReplacement?: string;
        regexTarget?: 'raw' | 'cleaned';
      }>(req);

      const rawUrl = (body.megaUrl || '').trim();
      const parsedUrl = parseMegaUrl(rawUrl);
      if (!parsedUrl.isValid) {
        return jsonResponse(
          { error: parsedUrl.error || 'A valid Mega.nz folder or file link is required.' },
          400,
          baseHeaders
        );
      }

      const existingFolders = await db.getLibraryFolders();
      const folderId =
        (body.id || '').trim() ||
        `fld-${parsedUrl.handleId.toLowerCase().slice(0, 8)}-${Date.now().toString(36).slice(-4)}`;

      // Either use provided videos from inspect preview or inspect on the spot
      let rawVideos: VideoItem[] = Array.isArray(body.videos) ? body.videos : [];
      let detectedName = (body.name || '').trim();
      let detectedGenre = (body.genre || '').trim();

      if (rawVideos.length === 0) {
        const inspected = await inspectMegaLink(parsedUrl.normalizedUrl, db);
        rawVideos = inspected.videos;
        if (!detectedName) detectedName = inspected.folderName;
        if (!detectedGenre) detectedGenre = inspected.suggestedGenre;
      }

      const finalFolderName = detectedName || `Mega Collection ${parsedUrl.handleId.slice(0, 6)}`;
      const finalGenre = detectedGenre || inferGenreFromName(finalFolderName);

      // Apply optional Custom Regex Filename Trimmer if configured
      const normalizedVideos: VideoItem[] = rawVideos.map((vid, idx) => {
        const nodeId = vid.nodeId || `node-${idx + 1}`;
        const rootUrl = vid.rootUrl || parsedUrl.normalizedUrl;
        const opaqueId = generateOpaqueVideoId(rootUrl, nodeId);
        let finalTitle = (vid.title || vid.cleanedFileName || '').trim();

        if (!finalTitle) {
          finalTitle = cleanVideoFileName(vid.rawFileName).title;
        }

        if (body.regexPattern) {
          const sourceStr =
            body.regexTarget === 'raw' ? vid.rawFileName : vid.cleanedFileName || finalTitle;
          const trimmed = applyCustomRegexTrim(
            sourceStr,
            body.regexPattern,
            body.regexReplacement || ''
          );
          if (trimmed.isValidRegex && trimmed.result) {
            finalTitle = trimmed.result;
          }
        }

        return {
          ...vid,
          id: opaqueId,
          folderId,
          title: finalTitle,
          cleanedFileName: finalTitle,
          rootUrl,
          nodeId,
        };
      });

      const totalSizeBytes = normalizedVideos.reduce((acc, v) => acc + (v.sizeBytes || 0), 0);
      const existingIdx = existingFolders.findIndex((f) => f.id === folderId);
      const position = existingIdx >= 0 ? existingFolders[existingIdx].position : existingFolders.length;

      const folderRecord: LibraryFolder = {
        id: folderId,
        name: finalFolderName,
        description:
          (body.description || '').trim() ||
          `${finalGenre} collection streaming from Mega.nz encrypted storage.`,
        genre: finalGenre,
        megaUrl: parsedUrl.normalizedUrl,
        sourceType: body.sourceType || parsedUrl.sourceType,
        position,
        totalSizeBytes,
        videos: normalizedVideos,
        createdAt: existingIdx >= 0 ? existingFolders[existingIdx].createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      const saved = await db.upsertLibraryFolder(folderRecord);
      return jsonResponse({ folder: saved }, 201, baseHeaders);
    }

    const adminFolderMatch = pathname.match(/^\/api\/admin\/folders\/([^/]+)$/);
    if (adminFolderMatch) {
      const auth = await authenticateAdminRequest(req, db, env);
      if (!auth.authenticated) {
        return jsonResponse({ error: 'Unauthorized administrator access.' }, 401, baseHeaders);
      }

      const folderId = decodeURIComponent(adminFolderMatch[1]);

      if (method === 'PATCH') {
        const existing = await db.getLibraryFolderById(folderId);
        if (!existing) {
          return jsonResponse({ error: 'Folder not found.' }, 404, baseHeaders);
        }

        const body = await parseJsonBody<{
          name?: string;
          description?: string;
          genre?: string;
          position?: number;
          videos?: VideoItem[];
          regexPattern?: string;
          regexReplacement?: string;
          regexTarget?: 'raw' | 'cleaned';
        }>(req);

        let updatedVideos = Array.isArray(body.videos) ? body.videos : existing.videos;
        if (body.regexPattern) {
          updatedVideos = updatedVideos.map((v) => {
            const target = body.regexTarget === 'raw' ? v.rawFileName : v.cleanedFileName || v.title;
            const res = applyCustomRegexTrim(target, body.regexPattern!, body.regexReplacement || '');
            return res.isValidRegex && res.result
              ? { ...v, title: res.result, cleanedFileName: res.result }
              : v;
          });
        }

        const updated: LibraryFolder = {
          ...existing,
          name: body.name !== undefined ? body.name.trim() || existing.name : existing.name,
          description:
            body.description !== undefined ? body.description.trim() : existing.description,
          genre: body.genre !== undefined ? body.genre.trim() || existing.genre : existing.genre,
          position: typeof body.position === 'number' ? body.position : existing.position,
          videos: updatedVideos,
          updatedAt: Date.now(),
        };

        const saved = await db.upsertLibraryFolder(updated);
        return jsonResponse({ folder: saved }, 200, baseHeaders);
      }

      if (method === 'DELETE') {
        await db.deleteLibraryFolder(folderId);
        return jsonResponse({ deleted: true, folderId }, 200, baseHeaders);
      }
    }

    // ========================================================================
    // 4. MEGA INSPECTION (/api/mega/inspect)
    // ========================================================================
    if (pathname === '/api/mega/inspect' && method === 'POST') {
      const auth = await authenticateAdminRequest(req, db, env);
      if (!auth.authenticated) {
        return jsonResponse({ error: 'Administrator session required for Mega inspection.' }, 401, baseHeaders);
      }

      const body = await parseJsonBody<{
        megaUrl?: string;
        url?: string;
        forceRefresh?: boolean;
      }>(req);

      const targetUrl = (body.megaUrl || body.url || '').trim();
      const parsed = parseMegaUrl(targetUrl);
      if (!parsed.isValid) {
        return jsonResponse({ error: parsed.error || 'Invalid Mega.nz URL' }, 400, baseHeaders);
      }

      const ttlMs = parseInt(env?.INSPECT_CACHE_TTL_MS || process.env.INSPECT_CACHE_TTL_MS || '86400000', 10);
      const timeoutMs = parseInt(env?.MEGA_GATEWAY_TIMEOUT_MS || process.env.MEGA_GATEWAY_TIMEOUT_MS || '20000', 10);

      const inspectData = await inspectMegaLink(parsed.normalizedUrl, db, {
        forceRefresh: Boolean(body.forceRefresh),
        ttlMs: isNaN(ttlMs) ? 86400000 : ttlMs,
        timeoutMs: isNaN(timeoutMs) ? 20000 : timeoutMs,
      });

      return jsonResponse({ inspection: inspectData }, 200, baseHeaders);
    }

    // ========================================================================
    // 5. MEGA STREAMING (/api/mega/stream) — GET & HEAD with HTTP Range
    // ========================================================================
    if (pathname === '/api/mega/stream' && (method === 'GET' || method === 'HEAD')) {
      const streamResp = await handleMegaVideoStream(req, db);
      const mergedHeaders = new Headers(streamResp.headers);
      for (const [k, v] of Object.entries(baseHeaders)) {
        if (!mergedHeaders.has(k)) {
          mergedHeaders.set(k, v);
        }
      }
      return new Response(streamResp.body, {
        status: streamResp.status,
        headers: mergedHeaders,
      });
    }

    // ========================================================================
    // 6. THUMBNAILS (/api/thumbnails/:fileName, /api/thumbnails/on-demand, /api/admin/thumbnails/generate)
    // ========================================================================
    const thumbGetMatch = pathname.match(/^\/api\/thumbnails\/([^/]+)$/);
    if (thumbGetMatch && method === 'GET' && thumbGetMatch[1] !== 'on-demand') {
      const fileName = decodeURIComponent(thumbGetMatch[1]);
      const thumb = await db.getThumbnail(fileName);
      if (!thumb) {
        return jsonResponse({ error: 'Thumbnail not found' }, 404, baseHeaders);
      }

      const cleanB64 = thumb.base64Data.replace(/^data:[^;]+;base64,/, '');
      const binaryBuf = Buffer.from(cleanB64, 'base64');
      await db.recordAnalyticsCounter({
        cacheHits: 1,
        cachedBytesServed: binaryBuf.length,
      });

      return new Response(new Uint8Array(binaryBuf), {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Type': thumb.mimeType || 'image/jpeg',
          'Content-Length': String(binaryBuf.length),
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      });
    }

    if (pathname === '/api/thumbnails/on-demand' && method === 'POST') {
      const body = await parseJsonBody<{
        videoId?: string;
        fileName?: string;
        mimeType?: string;
        base64Data?: string;
      }>(req);

      const videoId = (body.videoId || '').trim();
      const rawB64 = (body.base64Data || '').trim();
      if (!videoId || !rawB64) {
        return jsonResponse(
          { error: 'videoId and base64Data are required.' },
          400,
          baseHeaders
        );
      }

      const fileName = (body.fileName || `${videoId}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const mimeType = body.mimeType || 'image/jpeg';
      const cleanB64 = rawB64.replace(/^data:[^;]+;base64,/, '');

      await db.saveThumbnail({
        fileName,
        videoId,
        mimeType,
        base64Data: cleanB64,
        updatedAt: Date.now(),
      });

      return jsonResponse(
        {
          saved: true,
          videoId,
          fileName,
          url: `/api/thumbnails/${encodeURIComponent(fileName)}`,
        },
        201,
        baseHeaders
      );
    }

    if (pathname === '/api/admin/thumbnails/generate' && method === 'POST') {
      const auth = await authenticateAdminRequest(req, db, env);
      if (!auth.authenticated) {
        return jsonResponse({ error: 'Administrator session required.' }, 401, baseHeaders);
      }

      const body = await parseJsonBody<{
        videoId?: string;
        folderId?: string;
        base64Data?: string;
        mimeType?: string;
      }>(req);

      const folders = await db.getLibraryFolders();
      const targetVideos: Array<{ video: VideoItem; genre: string }> = [];

      for (const folder of folders) {
        if (body.folderId && folder.id !== body.folderId) continue;
        for (const vid of folder.videos) {
          if (body.videoId && vid.id !== body.videoId) continue;
          targetVideos.push({ video: vid, genre: folder.genre });
        }
      }

      if (targetVideos.length === 0) {
        return jsonResponse({ error: 'No matching videos found for thumbnail generation.' }, 404, baseHeaders);
      }

      const generated: Array<{ videoId: string; fileName: string }> = [];
      for (const item of targetVideos) {
        const isSvgFallback = !body.base64Data;
        const ext = isSvgFallback ? 'svg' : 'jpg';
        const fileName = `thumb-${item.video.id}.${ext}`;

        const payload = body.base64Data
          ? {
              mimeType: body.mimeType || 'image/jpeg',
              base64Data: body.base64Data.replace(/^data:[^;]+;base64,/, ''),
            }
          : generateServerCinemaThumbnailBase64(item.video.title, item.genre);

        await db.saveThumbnail({
          fileName,
          videoId: item.video.id,
          mimeType: payload.mimeType,
          base64Data: payload.base64Data,
          updatedAt: Date.now(),
        });
        generated.push({ videoId: item.video.id, fileName });
      }

      return jsonResponse(
        {
          generatedCount: generated.length,
          generated,
        },
        200,
        baseHeaders
      );
    }

    // ========================================================================
    // 7. WATCH STATES (/api/watch-states, /api/watch-states/:videoId)
    // ========================================================================
    const viewerKey =
      req.headers.get('x-viewer-key') ||
      url.searchParams.get('viewerKey') ||
      'anon-default-viewer';

    if (pathname === '/api/watch-states' && method === 'GET') {
      const states = await db.getViewerWatchStates(viewerKey);
      return jsonResponse({ watchStates: states }, 200, {
        ...baseHeaders,
        'Cache-Control': 'no-store',
      });
    }

    const watchStateMatch = pathname.match(/^\/api\/watch-states\/([^/]+)$/);
    if (watchStateMatch) {
      const videoId = decodeURIComponent(watchStateMatch[1]);

      if (method === 'PUT') {
        const body = await parseJsonBody<{
          folderId?: string;
          positionSec?: number;
          durationSec?: number;
          favorite?: boolean;
          viewerKey?: string;
        }>(req);

        const effectiveViewer = (body.viewerKey || viewerKey).trim();
        const saved = await db.upsertViewerWatchState({
          viewerKey: effectiveViewer,
          videoId,
          folderId: body.folderId || 'unknown',
          positionSec: typeof body.positionSec === 'number' ? body.positionSec : 0,
          durationSec: typeof body.durationSec === 'number' ? body.durationSec : 0,
          favorite: typeof body.favorite === 'boolean' ? body.favorite : false,
          updatedAt: Date.now(),
        });

        return jsonResponse({ watchState: saved }, 200, baseHeaders);
      }

      if (method === 'DELETE') {
        await db.deleteViewerWatchState(viewerKey, videoId);
        return jsonResponse({ deleted: true, videoId }, 200, baseHeaders);
      }
    }

    // ========================================================================
    // 8. ANALYTICS (/api/analytics/event, /api/admin/stats)
    // ========================================================================
    if (pathname === '/api/analytics/event' && method === 'POST') {
      const body = await parseJsonBody<{
        videoId?: string;
        folderId?: string;
        title?: string;
        folderName?: string;
        genre?: string;
        eventType?: 'view_start' | 'heartbeat' | 'seek' | 'complete';
        watchTimeDeltaSec?: number;
      }>(req);

      if (!body.videoId) {
        return jsonResponse({ error: 'videoId is required' }, 400, baseHeaders);
      }

      await db.recordVideoPlayback({
        videoId: body.videoId,
        folderId: body.folderId || 'unknown',
        title: body.title || 'Untitled Video',
        folderName: body.folderName || 'Library',
        genre: body.genre || 'Cinema',
        isViewStart: body.eventType === 'view_start',
        watchTimeDeltaSec: Number(body.watchTimeDeltaSec || 0),
      });

      return jsonResponse({ recorded: true }, 200, baseHeaders);
    }

    if (pathname === '/api/admin/stats' && method === 'GET') {
      const auth = await authenticateAdminRequest(req, db, env);
      if (!auth.authenticated) {
        return jsonResponse({ error: 'Unauthorized administrator access.' }, 401, baseHeaders);
      }

      const summary = await db.getAnalyticsSummary();
      const dbConn = await db.checkConnectivity();
      const uptimeSec = Math.floor((Date.now() - workerStartTime) / 1000);

      const statsResponse: AdminStatsResponse = {
        totalViews: summary.state.totalViews,
        totalWatchTimeSec: summary.state.totalWatchTimeSec,
        cacheHits: summary.state.cacheHits,
        megaRequests: summary.state.megaRequests,
        cachedBytesServed: summary.state.cachedBytesServed,
        topVideos: summary.topVideos,
        recentVideos: summary.recentVideos,
        cacheStats: summary.cacheStats,
        workerHealth: {
          platform,
          status: dbConn.connected ? 'healthy' : 'degraded',
          database: dbConn,
          cache: {
            inspectEntries: summary.cacheStats.inspectCount,
            streamBlocks: summary.cacheStats.streamBlockCount,
            storageTickets: summary.cacheStats.ticketCount,
            nodeKeys: summary.cacheStats.nodeKeyCount,
            thumbnails: summary.cacheStats.thumbnailCount,
          },
          metrics: {
            uptimeSec,
            requestsHandled: totalRequestsHandled,
          },
          timestamp: Date.now(),
        },
      };

      return jsonResponse(statsResponse, 200, baseHeaders);
    }

    // ========================================================================
    // 9. CACHE MANAGEMENT (/api/admin/cache/clear)
    // ========================================================================
    if (pathname === '/api/admin/cache/clear' && method === 'POST') {
      const auth = await authenticateAdminRequest(req, db, env);
      if (!auth.authenticated) {
        return jsonResponse({ error: 'Unauthorized administrator access.' }, 401, baseHeaders);
      }

      const body = await parseJsonBody<{
        categories?: string[];
      }>(req);

      const categories =
        Array.isArray(body.categories) && body.categories.length > 0
          ? body.categories
          : ['inspect_cache', 'stream_blocks', 'mega_storage_tickets'];

      const result = await db.clearCaches(categories);
      return jsonResponse(
        {
          cleared: result.cleared,
          timestamp: Date.now(),
        },
        200,
        baseHeaders
      );
    }

    return jsonResponse(
      { error: `API endpoint not found: ${method} ${pathname}` },
      404,
      baseHeaders
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return jsonResponse({ error: message }, 500, baseHeaders);
  }
}
