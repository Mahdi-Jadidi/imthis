# QA Report

Date: 2026-07-02

## Scope

Verified the release surface for the public funnel and the dashboard/policy surfaces:

- `index.html`
- `signup.html`
- `login.html`
- `dashboard-standard.html`
- `dashboard-premium.html`
- `payment-result.html`
- `privacy.html`
- `terms.html`
- `contact.html`
- `cookies.html`
- `dashboard-real-data.js`
- `dropcv-upload.js`
- `api/dropcv-api.js`

## Results

| Area | Status | Notes |
|---|---|---|
| Landing page flow | Passed | Funnel remains focused on a single main CTA path and the footer now exposes legal/support links. |
| Signup/login UX | Passed | Added visible footer access to contact, cookies, privacy, and terms from the authentication surfaces. |
| Legal coverage | Passed | Added standalone contact and cookie policy pages and expanded privacy/terms copy to match actual data handling. |
| Security hardening | Passed | Escaped dashboard analytics and upload error renderers to remove stored/reflected HTML injection risk. |
| Analytics privacy | Passed | Geo lookup is now optional and constrained to trusted http(s) endpoints through configuration. |
| Build validation | Passed | Frontend production build completed successfully. |
| Backend tests | Passed | Backend suite completed with `66/66` passing. |

## Issues Found And Fixed

1. The public site had privacy and terms pages, but no standalone contact or cookie policy page.
2. The legal copy did not fully describe the actual cookie/local-storage behavior used by the product.
3. Dashboard analytics rows and upload failure states rendered unescaped server-controlled text into `innerHTML`.
4. The analytics geo lookup had an insecure hardcoded third-party default, so it was replaced with an optional config-driven endpoint.
5. The earlier QA report was stale and has been refreshed to match the current release.
6. The homepage hero and bottom CTA now use the more explicit "Upload your CV — go live free" copy while keeping the 3-day trial messaging intact.

## Verification Notes

- `npm run build` passed after the release changes.
- `npm test` passed with all backend suites green.
- Public pages now link to `contact.html`, `cookies.html`, `privacy.html`, and `terms.html`.
- `privacy.html`, `terms.html`, `contact.html`, and `cookies.html` now provide the minimum policy/compliance details for support, cookies, data use, and user contact.
- The in-app browser was available for local homepage and signup verification, including English/Persian toggling and a 375px responsive check. The full upload/payment end-to-end flow still needs a separate pass with file-upload and ZarinPal credentials exercised from the browser UI.
