# Deployment

This repository is a monorepo:

- `frontend` is the I’m This Next.js app for Vercel.
- `backend` is the I’m This Fastify API and should be deployed separately.

## Vercel frontend setup

Set these project settings in Vercel:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Install Command: leave default
- Output Directory: leave default for Next.js

## Deployment URLs

- Live frontend alias: `https://dropcv-frontend.vercel.app/`
- Live backend alias: `https://drop-cv-backend.vercel.app`
- Canonical frontend after DNS connection: `https://imthis.site/`
- Canonical backend after DNS connection: `https://api.imthis.site`
- Customer sites after wildcard DNS/TLS: `https://{slug}.imthis.site/`

The live smoke targets are centralized in [`scripts/live-targets.mjs`](./scripts/live-targets.mjs) and can be overridden with `IMTHIS_FRONTEND_ORIGIN` and `IMTHIS_BACKEND_ORIGIN`. Run `npm run sync:live-configs` after changing the pair so the production config files stay in sync.

## Backend environment variables

Set these values on the backend deployment:

- `FRONTEND_URL=https://imthis.site/`
- Leave `COOKIE_DOMAIN` unset to create a host-only authentication cookie.
- `TRUSTED_FRONTEND_ORIGINS=https://imthis.site`
- `BACKEND_URL=https://api.imthis.site`
- `PUBLIC_SITE_URL_TEMPLATE=https://{slug}.imthis.site/`
- `AI_SITE_GENERATION_ENABLED=false` until the generation API is production-ready
- `ZARINPAL_MERCHANT_ID=<36-character merchant id>`
- `ZARINPAL_SANDBOX=false` (`true` outside production)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `SMTP_FROM=I'm This <noreply@imthis.site>`

Run `migrations/001_init.sql`, `002_trial_billing.sql`,
`003_revenue_mvp.sql` through `011_imthis_rebrand.sql`. The launch migrations restore
eligible paid sites if migration 003 was previously applied, disables legacy
arbitrary-HTML deployments, and enforces one pending payment per account.

The production cookie uses `SameSite=None; Secure` because the current frontend
and API deploy on separate HTTPS hosts. Keep it host-only after moving under
`imthis.site`; never set `COOKIE_DOMAIN=.imthis.site`, because customer
subdomains must not share the API authentication boundary.

## Why this is required

Vercel can build the app successfully, but if the project Root Directory points at the repo root, it will validate the wrong route/function paths and fail after build completion.

## Backend deployment

Deploy the backend to a Node-capable host separately, then point the frontend to `https://api.imthis.site` through environment variables.

## Current repo status

The repository already includes the build fixes needed for the frontend app:

- workspace-aware root package setup
- frontend build publish step
- Vercel compatibility shim for the build path

What remains is the Vercel dashboard configuration.

## Verification

- Live smoke: `npm run smoke:live`
- Browser smoke: `npm run smoke:live:browser`
- Full live QA: `npm run qa:live`
