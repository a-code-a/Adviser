# Marketplace Advisor

AI-assisted marketplace analysis for direct `eBay` and `Kleinanzeigen` listings.

The repo contains:

- A `Next.js App Router` web app with landing, login, dashboard, listing detail, and admin views.
- Supabase SQL migrations for auth profiles, quotas, queues, RLS, vector search, and RPCs.
- A separate `worker/` service intended for `Cloud Run`, using Playwright for browser scraping and OpenRouter for structured reports.

## Stack

- `Next.js 16` + `React 19`
- `Supabase` for Auth, Postgres, RLS, Storage-friendly raw snapshot persistence, `pgvector`, and `pgmq`
- `OpenRouter` for structured listing analysis and optional `openrouter:web_search`
- `Playwright` for browser-driven Kleinanzeigen fetches

## Environment

Copy `.env.example` to `.env.local` for the web app and provide the same server-side keys to the worker runtime:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL_ANALYSIS=google/gemini-3-flash-preview
OPENROUTER_ENABLE_WEB_SEARCH=true
EBAY_BROWSE_API_TOKEN=
EBAY_BROWSE_MARKETPLACE_ID=EBAY_DE
KLEINANZEIGEN_PROXY_URL=
WORKER_AUTH_TOKEN=
ADMIN_EMAILS=you@example.com
```

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Create a Supabase project and apply `supabase/migrations/202604172300_marketplace_advisor.sql`.

3. Start the web app.

```bash
npm run dev
```

4. Start the worker in a separate shell.

```bash
npm run worker:start
```

5. For scheduled tracked refreshes, call the worker endpoint:

```bash
curl -X POST http://localhost:8080/cron/refresh-tracked
```

## Main Flows

- `POST /api/import`
  Accepts a marketplace URL, creates or reuses a crawl target, links it to the current user, enqueues `import_url`, and returns the listing id.

- `POST /api/listings/:id/refresh`
  Enforces cooldown limits and enqueues `refresh_listing`.

- `POST /api/listings/:id/track`
  Promotes a listing from `observed` to `active`.

- `POST /api/admin/seeds`
  Admin-only seed enqueue route for broader crawl discovery.

- Worker queue pipeline:
  `import_url -> crawl_seed -> refresh_listing -> analyze_listing`

## Notes

- The worker stores raw HTML or API payloads on every refresh so parsers can be improved without refetching.
- eBay uses Browse API when a token is present, then falls back to HTML parsing.
- Kleinanzeigen uses Playwright and should be operated behind conservative throttles, auditing, and source controls.
- OpenRouter analysis falls back to a deterministic heuristic report if the API key is not configured or the model call fails.
- As of April 17, 2026, the configured Gemini analysis slug is `google/gemini-3-flash-preview` on OpenRouter.
