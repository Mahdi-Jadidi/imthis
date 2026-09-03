const { randomUUID } = require('node:crypto');
const env = require('../config/env');
const { revokeToken } = require('./authService');

const COOKIE_NAME = 'dropcv_token';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function authCookieOptions() {
  const options = {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    // Authentication is consumed through the same-origin frontend proxy.
    // Lax is more widely reliable than None and still protects cross-site POSTs.
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
  if (env.cookieDomain) options.domain = env.cookieDomain;
  return options;
}

function clearCookieOptions() {
  const options = {
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  };
  if (env.cookieDomain) options.domain = env.cookieDomain;
  return options;
}

function sessionPayload(user) {
  return {
    userId: user.id,
    email: user.email,
    plan: user.plan,
    userType: user.userType,
    // A unique identifier prevents two sessions issued in the same second
    // from producing the same JWT and sharing a revocation record.
    jti: randomUUID(),
  };
}

async function issueSession(fastify, reply, user) {
  const token = await fastify.jwt.sign(sessionPayload(user));
  reply.setCookie(COOKIE_NAME, token, authCookieOptions());
  return token;
}

function clearSession(reply) {
  reply.clearCookie(COOKIE_NAME, clearCookieOptions());
}

async function revokeSessionBestEffort(fastify, token, logger) {
  if (!token) return;
  try {
    const decoded = await fastify.jwt.verify(token);
    await revokeToken(token, decoded);
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn({ error }, 'Could not persist session revocation');
    }
  }
}

async function replaceSession(fastify, request, reply, user) {
  const previousToken = request.cookies?.[COOKIE_NAME];
  const token = await issueSession(fastify, reply, user);
  if (previousToken && previousToken !== token) {
    await revokeSessionBestEffort(fastify, previousToken, request.log);
  }
  return token;
}

module.exports = {
  COOKIE_NAME,
  COOKIE_MAX_AGE_SECONDS,
  authCookieOptions,
  clearCookieOptions,
  sessionPayload,
  issueSession,
  clearSession,
  revokeSessionBestEffort,
  replaceSession,
};
