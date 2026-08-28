export const LIVE_FRONTEND_ORIGIN = process.env.IMTHIS_FRONTEND_ORIGIN || 'https://dropcv-frontend.vercel.app';
export const LIVE_BACKEND_ORIGIN = process.env.IMTHIS_BACKEND_ORIGIN || 'https://drop-cv-backend.vercel.app';
export const LIVE_FRONTEND_API_BASE = '/proxy';

export const LIVE_REPO_CONFIG_FILES = Object.freeze([
  'public/site-config.js',
]);

export const LIVE_PREFLIGHT_CASES = Object.freeze([
  { path: '/api/auth/login', method: 'POST', requestHeaders: 'content-type' },
  { path: '/api/auth/register', method: 'POST', requestHeaders: 'content-type' },
  { path: '/api/upload/cv', method: 'POST', requestHeaders: 'content-type' },
  { path: '/api/sites/upload', method: 'POST', requestHeaders: 'content-type' },
  { path: '/api/analytics/track', method: 'POST', requestHeaders: 'content-type' },
]);

export function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/$/, '');
}

export function resolveLiveUrl(origin, path) {
  return new URL(path, normalizeOrigin(origin)).toString();
}

export function buildProductionSiteConfig() {
  return [
    'window.dropCVConfig = window.dropCVConfig || {};',
    `window.dropCVConfig.apiBaseUrl = "${LIVE_FRONTEND_API_BASE}";`,
    '',
  ].join('\n');
}

export function getSiteConfigLoaderMarker() {
  return "document.write('<script src=\"site-config.production.js\"></script>');";
}
