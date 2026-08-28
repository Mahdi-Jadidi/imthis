const crypto = require('crypto');
const env = require('../config/env');
const { runTrialLifecycleCycle } = require('../jobs/trialLifecycle');
const { runExpiryCycle } = require('../jobs/subscriptionExpiry');

function hasValidCronSecret(request) {
  const expected = String(env.cronSecret || '');
  const authorization = String(request.headers.authorization || '');
  const provided = authorization.replace(/^Bearer\s+/i, '');

  if (!expected || !provided || expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

async function lifecycleRoutes(fastify) {
  fastify.get('/lifecycle', async function lifecycleHandler(request, reply) {
    if (!hasValidCronSecret(request)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    await runTrialLifecycleCycle();
    await runExpiryCycle();
    return reply.send({ success: true, ranAt: new Date().toISOString() });
  });
}

module.exports = lifecycleRoutes;
