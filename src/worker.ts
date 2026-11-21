// ============================================================================
// CineMega — Cloudflare Workers Entrypoint (`src/worker.ts`)
// ============================================================================
// Routes `/api/*` requests through the shared `handleApiRequest` core handler
// and supports optional static frontend asset hosting + SPA fallback via ASSETS binding.

import { handleApiRequest } from './api/coreHandler';
import type { EnvVars } from './api/supabaseStore';

export interface CloudflareWorkerEnv extends EnvVars {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(
    request: Request,
    env: CloudflareWorkerEnv
  ): Promise<Response> {
    const url = new URL(request.url);

    // Route all /api/* requests through the shared backend core
    if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
      return handleApiRequest(request, {
        platform: 'Cloudflare Workers',
        env,
      });
    }

    // If static frontend assets binding is configured, serve asset or SPA fallback
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
      // SPA fallback to index.html for client-side routes (/watch/*, /library, /admin, etc.)
      const indexUrl = new URL('/index.html', request.url);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    }

    return new Response(
      JSON.stringify({
        service: 'CineMega Distributed Worker (Cloudflare)',
        status: 'online',
        apiHealthEndpoint: '/api/health',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  },
};
