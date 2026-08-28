const fp = require('fastify-plugin');
const cookie = require('@fastify/cookie');
const jwt = require('@fastify/jwt');
const env = require('../config/env');

async function authPlugin(fastify) {
  await fastify.register(cookie, {
    secret: env.jwtSecret,
    hook: 'onRequest',
  });

  await fastify.register(jwt, {
    secret: env.jwtSecret,
    cookie: {
      cookieName: 'dropcv_token',
      signed: false,
    },
    sign: {
      expiresIn: env.jwtExpiresIn,
    },
  });

  fastify.decorate('issueAuthCookie', async function issueAuthCookie(reply, payload) {
    const token = await fastify.jwt.sign(payload);

    const cookieOptions = {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    };
    if (env.cookieDomain) cookieOptions.domain = env.cookieDomain;
    reply.setCookie('dropcv_token', token, cookieOptions);

    return token;
  });
}

module.exports = fp(authPlugin);
