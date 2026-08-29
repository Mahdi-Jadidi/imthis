# I'm This

Monorepo for the **I'm This** personal-site platform.

- `frontend/` — Next.js application and public web experience.
- `backend/` — Fastify API, migrations, background lifecycle endpoints, and Vercel serverless handler.

## Vercel projects

Keep two Vercel projects so the browser app and API retain their isolated deployment settings, while both deploy from this one repository:

| Project | Root Directory | Production domain |
| --- | --- | --- |
| Frontend | `frontend` | `imthis.site` |
| Backend | `backend` | `api.imthis.site` |

The frontend's `/proxy/api/*` rewrite reaches the API using the existing production configuration. Do not set the authentication cookie domain to `.imthis.site`.

## Local development

Install and run each app from its own directory:

```sh
cd frontend && npm install && npm run dev
cd backend && npm install && npm run dev
```

See `frontend/DEPLOYMENT.md` for required production environment variables and the deployment checklist
