# CineMega — Complete Production Deployment & Operations Guide

This guide covers all 14 deployment, configuration, verification, and monitoring steps for running **CineMega** across **Supabase PostgreSQL**, **Cloudflare Workers**, **Vercel Functions**, **Netlify Functions**, and **Static Frontend Hosting**.

---

## 1. How to Create the Supabase Project

1. Sign in to [Supabase](https://supabase.com) and click **New Project**.
2. Choose an organization, enter the project name `cinemega-production`, generate a strong database password, and select a region close to your primary API workers.
3. Wait ~60 seconds for the PostgreSQL instance to finish provisioning.
4. Navigate to **Project Settings → API** and copy:
   - **Project URL** (`SUPABASE_URL`, e.g., `https://xyzcompany.supabase.co`)
   - **Service Role Secret Key** (`SUPABASE_SERVICE_ROLE_KEY`, starts with `eyJ...`)
   - **CRITICAL SECURITY NOTE:** Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend or prefix it with `VITE_`.

---

## 2. How to Execute `supabase/schema.sql`

1. In your Supabase Dashboard, open the **SQL Editor** from the left sidebar.
2. Click **New Query**.
3. Copy the entire contents of `supabase/schema.sql` from this repository and paste it into the editor.
4. Click **Run** (or press `Cmd/Ctrl + Enter`).
5. Verify in **Table Editor** that all 11 tables exist and show **RLS Enabled**:
   - `library_meta`
   - `library_folders`
   - `video_thumbnails`
   - `inspect_cache`
   - `stream_blocks`
   - `mega_node_keys`
   - `mega_storage_tickets`
   - `analytics_state`
   - `played_videos`
   - `admin_config`
   - `viewer_watch_states`

---

## 3. How to Configure Environment Variables

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
```

### Server-Side Variables (Set on Cloudflare, Vercel, Netlify, and Local Node.js)

| Variable | Description |
| :--- | :--- |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret key (bypasses RLS strictly from backend workers) |
| `SESSION_SECRET` | Random 32+ character secret used to sign administrator HMAC session tokens |
| `ADMIN_PASSCODE` | Optional override passcode for administrator login (or leave empty to use the first-run scrypt claim setup) |
| `ALLOWED_ORIGINS` | Comma-separated allowed frontend origins for authenticated admin CORS requests |
| `INSPECT_CACHE_TTL_MS` | Inspection cache TTL in milliseconds (default `86400000` / 24h) |
| `TICKET_CACHE_TTL_MS` | Mega CDN ticket cache TTL in milliseconds (default `1800000` / 30m) |
| `STREAM_BLOCK_CACHE_LIMIT_MB` | Maximum size of cached decrypted stream blocks (default `256` MB) |

### Frontend Build Variables (Exposed to Vite)

| Variable | Description |
| :--- | :--- |
| `VITE_API_BASE_URL` | Single API backend URL (optional if using `VITE_WORKER_URLS` or same-origin) |
| `VITE_WORKER_URLS` | Comma-separated distributed worker URLs across Cloudflare, Vercel, and Netlify |

---

## 4. How to Deploy the Backend to Cloudflare Workers

CineMega includes `src/worker.ts` and `wrangler.toml` configured with `nodejs_compat`.

```bash
# 1. Authenticate Wrangler with your Cloudflare account
npx wrangler login

# 2. Configure encrypted server-side secrets
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SESSION_SECRET

# 3. Build frontend assets (optional if hosting frontend on the same worker)
npm run build

# 4. Deploy the Cloudflare Worker
npx wrangler deploy
```

Your Cloudflare Worker will be live at `https://cinemega-worker.<your-subdomain>.workers.dev`.

---

## 5. How to Deploy the Backend to Vercel

CineMega includes `api/[...route].ts` and `vercel.json` routing all `/api/*` requests through `src/api/coreHandler.ts`.

```bash
# 1. Install Vercel CLI or import repository in Vercel Dashboard
npx vercel link

# 2. Add environment variables in Vercel Project Settings -> Environment Variables:
#    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET

# 3. Deploy to production
npx vercel --prod
```

---

## 6. How to Deploy the Backend to Netlify

CineMega includes `netlify/functions/api.ts` and `netlify.toml`.

```bash
# 1. Link project with Netlify
npx netlify link

# 2. Set server-side environment variables
npx netlify env:set SUPABASE_URL "https://your-project.supabase.co"
npx netlify env:set SUPABASE_SERVICE_ROLE_KEY "your-service-role-key"
npx netlify env:set SESSION_SECRET "your-32-char-session-secret"

# 3. Build and deploy
npx netlify deploy --build --prod
```

---

## 7. How to Deploy the Frontend Separately

Because the frontend communicates strictly via HTTP with the API worker pool (`src/utils/apiBase.ts`) and contains zero backend secrets or Supabase credentials, you can deploy the static build (`dist/`) to Cloudflare Pages, Vercel, Netlify, or any static CDN:

```bash
VITE_WORKER_URLS="https://cinemega-worker.example.workers.dev,https://cinemega-api.vercel.app,https://cinemega-api.netlify.app" npm run build
```

Upload the resulting `dist/` directory to your static host with SPA fallback (`/* -> /index.html`).

---

## 8. How to Configure `VITE_WORKER_URLS`

Set `VITE_WORKER_URLS` in your frontend build environment as a comma-separated list of deployed worker base URLs (without trailing slashes):

```env
VITE_WORKER_URLS=https://cinemega-worker.example.workers.dev,https://cinemega-api.vercel.app,https://cinemega-api.netlify.app
```

If you only have a single backend deployment, set:

```env
VITE_API_BASE_URL=https://cinemega-worker.example.workers.dev
```

---

## 9. How to Test Worker Health

Run a `curl` request against `/api/health` on any worker deployment:

```bash
curl -i http://localhost:3000/api/health
```

Expected JSON response:

```json
{
  "platform": "Local Node.js",
  "status": "healthy",
  "database": {
    "connected": true,
    "mode": "supabase-postgres",
    "latencyMs": 14
  },
  "cache": {
    "inspectEntries": 2,
    "streamBlocks": 8,
    "storageTickets": 1,
    "nodeKeys": 5,
    "thumbnails": 4
  },
  "metrics": {
    "uptimeSec": 120,
    "requestsHandled": 18
  },
  "timestamp": 1763751000000
}
```

You can also view real-time worker telemetry in the **Admin Console → Distributed Workers & Cache** tab.

---

## 10. How to Test Backend Failover

1. Configure `VITE_WORKER_URLS` with multiple endpoints where the first endpoint is intentionally offline (e.g., `http://localhost:3999,http://localhost:3000`).
2. Load the CineMega frontend.
3. `src/utils/apiBase.ts` will detect the connection failure on `localhost:3999`, place that worker into a 30-second cooldown, and automatically fail over to `localhost:3000` with zero user-facing disruption.
4. Open **Admin Console → Distributed Workers & Cache** to see the failed worker marked in `COOLDOWN` alongside its error reason. After 30 seconds, the worker is automatically eligible for recovery probes.

---

## 11. How to Test Mega Folder Inspection

1. Sign in at `/admin`.
2. In the **Library & Regex Trimmer** tab, paste a public Mega.nz folder URL (`https://mega.nz/folder/<id>#<key>`) or file URL (`https://mega.nz/file/<id>#<key>`).
3. Click **Inspect Mega Link**.
4. Verify that detected video titles are cleaned of noise tokens (`1080p`, `WEB-DL`, `x265`, etc.), opaque IDs (`vid-xxxxxxxxxxxx`) are assigned, and the result is cached in Supabase `inspect_cache`.
5. Test the **Custom Regex Filename Trimmer** with a pattern and replacement string to preview title transformations live before clicking **Save Collection**.

---

## 12. How to Test Video Streaming and Seeking

Test HTTP Byte-Range support (`206 Partial Content`) directly via `curl`:

```bash
# Request bytes 0-1023 of a video stream
curl -i -H "Range: bytes=0-1023" "http://localhost:3000/api/mega/stream?videoId=vid-solaris01"

# Verify HEAD request headers
curl -I -H "Range: bytes=0-511" "http://localhost:3000/api/mega/stream?videoId=vid-solaris01"

# Verify 416 Range Not Satisfiable on out-of-bounds range
curl -i -H "Range: bytes=999999999999-9999999999999" "http://localhost:3000/api/mega/stream?videoId=vid-solaris01"
```

Verify that responses include:
- `HTTP/1.1 206 Partial Content`
- `Accept-Ranges: bytes`
- `Content-Range: bytes 0-1023/<totalSize>`
- `Content-Length: 1024`
- `Content-Type: video/mp4`

---

## 13. How to Configure Caching

- **Inspection Cache (`inspect_cache`)**: Controlled by `INSPECT_CACHE_TTL_MS` (default 24 hours). Can be bypassed per request by checking **Force fresh Mega.nz inspection** in the Admin Console.
- **Storage Tickets (`mega_storage_tickets`)**: Caches temporary Mega CDN URLs (`TICKET_CACHE_TTL_MS`, default 30 minutes) to avoid redundant Mega API calls during byte-range seeking.
- **Decrypted Stream Blocks (`stream_blocks`)**: Caches hot 512 KB aligned blocks up to `STREAM_BLOCK_CACHE_LIMIT_MB` with automatic LRU eviction.
- **Selective Cache Invalidation**: Administrators can purge `inspect_cache`, `stream_blocks`, `mega_storage_tickets`, or `mega_node_keys` individually in **Admin Console → Distributed Workers & Cache**.

---

## 14. How to Monitor Backend Errors

- **HTTP Response Headers**: Every worker attaches `X-CineMega-Worker` (`Cloudflare Workers`, `Vercel Functions`, `Netlify Functions`, or `Local Node.js`) and `X-CineMega-Cache` (`HIT` or `MISS`).
- **Admin Dashboard Health Matrix**: Displays per-worker status, database latency, consecutive failure counts, and last error messages.
- **Platform Logs**:
  - Cloudflare Workers: `npx wrangler tail`
  - Vercel Functions: `npx vercel logs`
  - Netlify Functions: `npx netlify functions:log`
