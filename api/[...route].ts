// ============================================================================
// CineMega — Vercel Functions Entrypoint (`api/[...route].ts`)
// ============================================================================
// Routes all `/api/*` requests through the shared `handleApiRequest` core.

import { handleApiRequest } from '../src/api/coreHandler';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

export default async function vercelApiHandler(request: Request): Promise<Response> {
  return handleApiRequest(request, {
    platform: 'Vercel Functions',
    env: process.env as Record<string, string | undefined>,
  });
}
