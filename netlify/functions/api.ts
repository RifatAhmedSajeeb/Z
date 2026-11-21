// ============================================================================
// CineMega — Netlify Functions Entrypoint (`netlify/functions/api.ts`)
// ============================================================================
// Routes all `/api/*` requests through the shared `handleApiRequest` core.

import { handleApiRequest } from '../../src/api/coreHandler';

export default async function netlifyApiHandler(request: Request): Promise<Response> {
  return handleApiRequest(request, {
    platform: 'Netlify Functions',
    env: process.env as Record<string, string | undefined>,
  });
}

export const config = {
  path: '/api/*',
};
