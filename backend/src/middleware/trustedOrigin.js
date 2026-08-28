const { isTrustedFrontendOrigin, normalizeOrigin } = require('../config/origins');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function trustedOrigin(request, reply) {
  if (SAFE_METHODS.has(request.method) || !request.cookies?.dropcv_token) return;

  const origin = normalizeOrigin(request.headers.origin);
  // Native/server-to-server clients generally omit Origin. Browser mutations
  // must come from an explicitly trusted product frontend.
  if (!origin) return;
  if (!isTrustedFrontendOrigin(origin)) {
    return reply.code(403).send({ error: 'Untrusted request origin' });
  }
}

module.exports = trustedOrigin;
