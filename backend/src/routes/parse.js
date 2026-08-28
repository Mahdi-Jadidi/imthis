const requireAuth = require('../middleware/requireAuth');
const requirePlan = require('../middleware/requirePlan');
const env = require('../config/env');
const { parseFile, getParsedContent } = require('../services/parseService');

function sendParseError(reply, error) {
  const statusCode = error.statusCode || (error.message === 'Parsed content not found' || error.message === 'Deployment not found' ? 404 : 500);

  if (statusCode === 500) {
    console.error('Parse route error', error);
  }

  return reply.code(statusCode).send({ error: statusCode >= 500 ? 'Internal server error' : error.message });
}

async function parseRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.post(
    '/:deploymentId',
    { preHandler: requirePlan('Annual') },
    async function parseDeploymentHandler(request, reply) {
      if (!env.aiSiteGenerationEnabled) return reply.code(410).send({ error: 'Automatic site generation is not available yet' });
      try {
        const result = await parseFile(request.params.deploymentId, request.user.userId);

        return reply.send({
          success: true,
          deploymentId: result.deploymentId,
          status: result.status,
        });
      } catch (error) {
        return sendParseError(reply, error);
      }
    },
  );

  fastify.get('/:deploymentId', async function getParsedContentHandler(request, reply) {
    try {
      const result = await getParsedContent(request.params.deploymentId, request.user.userId);

      return reply.send({
        success: true,
        parsedContent: result,
      });
    } catch (error) {
      return sendParseError(reply, error);
    }
  });
}

module.exports = parseRoutes;
