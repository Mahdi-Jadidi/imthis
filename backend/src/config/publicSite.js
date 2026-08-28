const DEFAULT_PUBLIC_SITE_URL_TEMPLATE = 'https://{slug}.imthis.site/';
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'support', 'mail']);
// Protect short, system, brand, and public-figure names from being claimed as
// personal-site addresses. Keep this list intentionally conservative and add
// new protected names here as needed.
const PROTECTED_PUBLIC_NAMES = new Set([
  'google', 'apple', 'microsoft', 'amazon', 'meta', 'facebook', 'instagram',
  'youtube', 'tiktok', 'twitter', 'x', 'linkedin', 'github', 'openai',
  'chatgpt', 'anthropic', 'claude', 'tesla', 'nike', 'adidas', 'cocacola',
  'digikala', 'snapp', 'tap30', 'divar', 'sheypoor', 'filimo', 'aparat',
  'hamrahaval', 'irancell', 'mtn', 'shatel', 'zarinpal',
  'elon-musk', 'jeff-bezos', 'bill-gates', 'mark-zuckerberg', 'taylor-swift',
  'cristiano-ronaldo', 'lionel-messi', 'barack-obama', 'donald-trump',
]);

function getSlugRestriction(slug) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (normalized.length < 4) return 'too_short';
  if (RESERVED_SUBDOMAINS.has(normalized)) return 'system';
  if (PROTECTED_PUBLIC_NAMES.has(normalized)) return 'protected_name';
  return null;
}

function normalizePathPrefix(value) {
  const prefix = String(value || '').trim().replace(/\/+$/, '');

  if (!prefix || prefix === '/') {
    return '';
  }

  return prefix.startsWith('/') ? prefix : `/${prefix}`;
}

function getPublicSiteUrlTemplate() {
  const template = String(process.env.PUBLIC_SITE_URL_TEMPLATE || DEFAULT_PUBLIC_SITE_URL_TEMPLATE).trim();

  return template.includes('{slug}') ? template : DEFAULT_PUBLIC_SITE_URL_TEMPLATE;
}

function buildPublicSiteUrl(slug) {
  const normalizedSlug = String(slug || '').trim();

  if (!normalizedSlug) {
    return null;
  }

  return getPublicSiteUrlTemplate().replace(/{slug}/g, normalizedSlug);
}

function getPublicSitePathPrefix() {
  return normalizePathPrefix(process.env.PUBLIC_SITE_PATH_PREFIX || '/site');
}

function getRequestPath(request) {
  try {
    return new URL(request.raw.url, 'http://imthis.local').pathname || '/';
  } catch (error) {
    return '/';
  }
}

function getHostSlug(request) {
  const host = String(request.hostname || request.headers.host || '').trim().toLowerCase();
  const match = host.match(/^([a-z0-9-]+)\.imthis\.site$/i);
  const slug = match ? match[1] : null;

  return slug && !getSlugRestriction(slug) ? slug : null;
}

function getPublicSiteRouteInfo(request) {
  const requestPath = getRequestPath(request);
  const hostSlug = getHostSlug(request);

  if (hostSlug) {
    return {
      slug: hostSlug,
      requestPath,
    };
  }

  const prefix = getPublicSitePathPrefix();
  if (prefix) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = requestPath.match(new RegExp(`^${escapedPrefix}/([a-z0-9-]+)(?:/(.*))?$`, 'i'));

    if (match) {
      return {
        slug: match[1],
        requestPath: match[2] ? `/${match[2]}` : '/',
      };
    }
  }

  return {
    slug: null,
    requestPath,
  };
}

module.exports = {
  buildPublicSiteUrl,
  getPublicSitePathPrefix,
  getPublicSiteRouteInfo,
  getSlugRestriction,
  normalizePathPrefix,
  PROTECTED_PUBLIC_NAMES,
  RESERVED_SUBDOMAINS,
};
