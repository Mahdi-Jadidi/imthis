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

}

module.exports = fp(authPlugin);
