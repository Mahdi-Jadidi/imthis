const env = require('./env');

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/$/, '');
}

function isTrustedFrontendOrigin(origin) {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) {
    return false;
  }

  if (env.trustedFrontendOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // Customer sites are hosted on subdomains of imthis.site. They are
  // untrusted content and must never gain credentialed API or CSRF access.
  return false;
}

module.exports = {
  normalizeOrigin,
  isTrustedFrontendOrigin,
};
