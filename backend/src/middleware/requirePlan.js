const billingService = require('../services/billingService');

function requirePlan(...plans) {
  return async function requirePlanMiddleware(request, reply) {
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!plans.includes(request.user.plan)) {
      return reply.code(403).send({ error: 'This feature requires a higher plan' });
    }

    const lifecycle = await billingService.checkSiteStatus(request.user.userId);
    if (!['trial', 'active'].includes(lifecycle.status)) {
      return reply.code(402).send({ error: 'An active trial or subscription is required' });
    }

    request.subscription = lifecycle;
  };
}

module.exports = requirePlan;
