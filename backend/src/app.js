const fastify = require('fastify');
const multipart = require('@fastify/multipart');

const authPlugin = require('./plugins/auth');
const corsPlugin = require('./plugins/cors');
const env = require('./config/env');
const { isTrustedFrontendOrigin, normalizeOrigin } = require('./config/origins');
const { ensureRebrandSchema } = require('./services/rebrandSchemaService');

const authRoutes = require('./routes/auth');
const planRoutes = require('./routes/plans');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const deployRoutes = require('./routes/deploy');
const parseRoutes = require('./routes/parse');
const analyticsRoutes = require('./routes/analytics');
const statsRoutes = require('./routes/stats');
const paymentRoutes = require('./routes/payments');
const previewRoutes = require('./routes/preview');
const siteRoutes = require('./routes/sites');
const adminRoutes = require('./routes/admin');
const siteRequestRoutes = require('./routes/siteRequests');
const lifecycleRoutes = require('./routes/lifecycle');
const trustedOrigin = require('./middleware/trustedOrigin');

async function buildApp(options = {}) {
  const app = fastify({
    logger: true,
    trustProxy: env.trustProxy,
    ...options,
  });

  // Schema migrations take DDL locks. Running them while a serverless request
  // is starting can leave a public customer site waiting until Vercel's
  // timeout. Production migrations are applied by the deploy/migration step;
  // retain an explicit opt-in for local bootstrap only.
  if (process.env.RUN_SCHEMA_MIGRATIONS_ON_START === 'true') {
    await ensureRebrandSchema();
  }

  await app.register(corsPlugin);
  await app.register(authPlugin);
  app.addHook('preHandler', trustedOrigin);
  await app.register(multipart);
  app.addHook('onSend', async (request, reply, payload) => {
    const origin = normalizeOrigin(request.headers.origin);
    if (origin && isTrustedFrontendOrigin(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('X-Frame-Options', 'DENY');
    return payload;
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(planRoutes, { prefix: '/api/plans' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  await app.register(deployRoutes, { prefix: '/api/deploy' });
  await app.register(parseRoutes, { prefix: '/api/parse' });
  // Legacy marketplace code remains unregistered for the MVP.
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(statsRoutes, { prefix: '/api/stats' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.register(previewRoutes, { prefix: '/api/preview' });
  await app.register(siteRoutes, { prefix: '/api/sites' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(siteRequestRoutes, { prefix: '/api/site-requests' });
  await app.register(lifecycleRoutes, { prefix: '/api/internal' });
  await app.register(deployRoutes);

  app.get('/health', async function healthCheck() {
    return { status: 'ok' };
  });

  return app;
}

module.exports = buildApp;
