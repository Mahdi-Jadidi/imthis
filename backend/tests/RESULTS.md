# drop.cv Test Results

Date: 2026-07-03

## Revenue MVP checks

| Check | Result |
|---|---|
| Server-controlled Standard/Premium IRT prices | Pass |
| Revenue migration draft/payment invariants | Pass |
| Public deployment requires active subscription | Pass |
| ZarinPal amount binding and idempotency guards | Pass |
| Trusted-origin and host-only cookie hardening | Pass |
| Database-backed payment request and duplicate-request blocking | Pass |
| Database-backed verified and failed payment callback flows | Pass |
| Trial users can publish without payment | Pass |
| Offline_grace users are blocked from public viewing | Pass |

Command: `npm run test:revenue` - 11 passed, 0 failed.

## Frontend

`npm run build` completed successfully with Next.js 16.2.9. New public pages
also passed HTML parsing and inline JavaScript compilation checks.

## Integration environment still required

The browser QA and ZarinPal sandbox e2e passes still need a live bootable API
process and sandbox credentials in this local workspace. The database schema has
been upgraded through migrations 001-004, and the revenue test suite is green,
but the full browser flow should be rerun against the real API before staging.

Legacy marketplace routes and suites have been removed from the MVP runner.

## Backend integration suite

Command: `npm test` - 66 passed, 0 failed, 0 skipped.

New coverage added:

- trial users can publish before payment
- trial and paid public shells share the same delivery headers
- offline_grace users are blocked from public viewing
