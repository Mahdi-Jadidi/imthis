const requireAuth = require('../middleware/requireAuth');
const requirePlan = require('../middleware/requirePlan');
const {
  AnalyticsError,
  trackAnalyticsEvent,
  getAnalyticsDashboard,
} = require('../services/analyticsService');

function sendAnalyticsError(reply, error) {
  if (error instanceof AnalyticsError) {
    const body = { error: error.message };

    if (error.field) {
      body.field = error.field;
    }

    return reply.code(error.statusCode).send(body);
  }

  console.error('Analytics route error', error);
  return reply.code(500).send({ error: 'Internal server error' });
}

async function analyticsRoutes(fastify) {
  fastify.post('/track', async function trackHandler(request, reply) {
    try {
      const body = request.body || {};
      const result = await trackAnalyticsEvent({
        domainSlug: body.domainSlug,
        referrer: body.referrer,
        userAgent: body.userAgent || request.headers['user-agent'],
        ip: request.ip,
      });

      return reply.send({ success: result.success });
    } catch (error) {
      return sendAnalyticsError(reply, error);
    }
  });

  fastify.get(
    '/dashboard',
    { preHandler: [requireAuth, requirePlan('Annual')] },
    async function dashboardHandler(request, reply) {
      try {
        const dashboard = await getAnalyticsDashboard(request.user.userId);

        return reply.send(dashboard);
      } catch (error) {
        return sendAnalyticsError(reply, error);
      }
    },
  );
}

module.exports = analyticsRoutes;
