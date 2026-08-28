# I’m This

Frontend for the I’m This personal-site creation and hosting product.

- `frontend`: public website and app UI
- `backend`: API, auth, site requests, hosting, analytics, and billing services

## Quick start

- Frontend: `npm run dev`
- Backend: run from the sibling `backend` directory

## Deploy notes

- The frontend builds as a standalone Next.js app.
- The backend is a Fastify service with its own Docker and nginx deployment assets.
- Keep the frontend and backend versioned together, but deploy them as separate services.
- On Vercel, point the frontend project root at this directory.
- Deploy the backend to a Node-capable host, or refactor it into Vercel-compatible serverless routes before trying to host it on Vercel.

## Live QA

- Current frontend: [https://dropcv-frontend.vercel.app/](https://dropcv-frontend.vercel.app/)
- Current backend: [https://drop-cv-backend.vercel.app](https://drop-cv-backend.vercel.app)
- Canonical domains after DNS connection: `https://imthis.site/` and `https://api.imthis.site`
- Sync production config files: `npm run sync:live-configs`
- Endpoint smoke: `npm run smoke:live`
- Browser smoke: `npm run smoke:live:browser`
- Full live QA: `npm run qa:live`
