// ============================================================================
// CineMega — Local Node.js & Production Express Server (`server.ts`)
// ============================================================================
// Runs on port 3000, mounts Vite development middleware in dev mode, serves
// compiled static assets from `dist` in production, and routes all `/api/*`
// requests through the shared `src/api/coreHandler.ts` Web Standard handler.

import 'dotenv/config';
import express, { type Request as ExpressRequest, type Response as ExpressResponse } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './src/api/coreHandler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

/**
 * Converts an incoming Express request into a Web Standard `Request`
 * so `server.ts` executes the exact same `handleApiRequest` core as
 * Cloudflare Workers, Vercel Functions, and Netlify Functions.
 */
async function expressToWebRequest(req: ExpressRequest): Promise<Request> {
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  let bodyBuffer: Buffer | undefined;
  if (hasBody) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    bodyBuffer = Buffer.concat(chunks);
  }

  return new Request(fullUrl, {
    method,
    headers,
    body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined,
  });
}

/**
 * Pipes a Web Standard `Response` back into the Express response stream,
 * preserving HTTP status codes (including 206 Partial Content & 416),
 * headers, cookies, and binary byte ranges.
 */
async function sendWebResponseToExpress(
  webRes: Response,
  res: ExpressResponse
): Promise<void> {
  res.status(webRes.status);

  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!webRes.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(webRes.body as unknown as import('node:stream/web').ReadableStream);
  nodeStream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
  });
  nodeStream.pipe(res);
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

  // Route all /api/* requests through the shared platform-agnostic backend core
  app.all('/api/*', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const webReq = await expressToWebRequest(req);
      const webRes = await handleApiRequest(webReq, {
        platform: 'Local Node.js',
        env: process.env as Record<string, string | undefined>,
      });
      await sendWebResponseToExpress(webRes, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected server error';
      res.status(500).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');

  if (!isProd || !fs.existsSync(path.join(distPath, 'index.html'))) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CineMega server listening on http://localhost:${PORT}`);
  });
}

startServer();
