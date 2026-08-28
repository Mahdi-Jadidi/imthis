const fp = require('@fastify/cors');
const { isTrustedFrontendOrigin, normalizeOrigin } = require('../config/origins');

const ALLOWED_ORIGINS = [
  ...(process.env.TRUSTED_FRONTEND_ORIGINS || process.env.FRONTEND_URL || '').split(','),
  'http://localhost:8080',
  'http://127.0.0.1:8080',
].map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);

module.exports = async function corsPlugin(fastify) {
  await fastify.register(fp, {
    origin: (origin, callback) => {
      // Allow requests without an Origin header so curl, Postman, and backend
      // service-to-service calls continue to work during local development.
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (ALLOWED_ORIGINS.includes(normalizedOrigin) || isTrustedFrontendOrigin(normalizedOrigin)) {
        callback(null, normalizedOrigin);
        return;
      }

      fastify.log.warn({ origin }, 'CORS: blocked origin');
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'bypass-tunnel-reminder'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400,
  });
};
