const requireAuth = require('../middleware/requireAuth');
const requirePlan = require('../middleware/requirePlan');
const env = require('../config/env');
const billingService = require('../services/billingService');
const siteGenerationLimiter = require('../services/siteGenerationLimiter');
const { parseFile } = require('../services/parseService');
const { generateFromStory } = require('../services/cvGeneratorService');
const { UploadError, uploadCvFile, submitStory, getDeploymentStatus } = require('../services/uploadService');

function sendUploadError(reply, error) {
  if (error instanceof UploadError || typeof error.statusCode === 'number') {
    const body = { error: error.message };
    if (error.field) body.field = error.field;
    if (error.usage) body.usage = error.usage;
    return reply.code(error.statusCode).send(body);
  }
  if (error.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'File is too large' });
  console.error('Upload route error', error);
  return reply.code(500).send({ error: 'Internal server error' });
}

function unavailable(reply) {
  return reply.code(410).send({ error: 'Automatic site generation is not available yet. Submit a team-build request instead.' });
}

function runBackgroundJob(job, label, onFailure) {
  job.catch((error) => {
    console.error(`${label} failed`, error);
    if (onFailure) Promise.resolve(onFailure()).catch((refundError) => console.error('Generation limit refund failed', refundError));
  });
}

async function reserveGeneration(userId) {
  const lifecycle = await billingService.ensureTrialStarted(userId);
  return siteGenerationLimiter.reserve(userId, lifecycle);
}

async function uploadRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.post('/cv', { preHandler: requirePlan('Annual') }, async function uploadCvHandler(request, reply) {
    if (!env.aiSiteGenerationEnabled) return unavailable(reply);
    let reservation = null;
    try {
      reservation = await reserveGeneration(request.user.userId);
      const result = await uploadCvFile(request, request.user.userId);
      runBackgroundJob(parseFile(result.deploymentId, request.user.userId),
        `Parsing deployment ${result.deploymentId}`, () => siteGenerationLimiter.refund(reservation));
      return reply.code(201).send({ ...result, generationUsage: reservation.usage });
    } catch (error) {
      if (reservation) await siteGenerationLimiter.refund(reservation).catch(() => {});
      return sendUploadError(reply, error);
    }
  });

  fastify.post('/story', { preHandler: requirePlan('Annual') }, async function uploadStoryHandler(request, reply) {
    if (!env.aiSiteGenerationEnabled) return unavailable(reply);
    let reservation = null;
    try {
      reservation = await reserveGeneration(request.user.userId);
      const result = await submitStory(request.user.userId, request.body || {});
      runBackgroundJob(generateFromStory(result.deploymentId, request.user.userId),
        `Story generation for deployment ${result.deploymentId}`, () => siteGenerationLimiter.refund(reservation));
      return reply.code(201).send({ ...result, generationUsage: reservation.usage });
    } catch (error) {
      if (reservation) await siteGenerationLimiter.refund(reservation).catch(() => {});
      return sendUploadError(reply, error);
    }
  });

  fastify.get('/status/:deploymentId', async function uploadStatusHandler(request, reply) {
    try { return reply.send(await getDeploymentStatus(request.user.userId, request.params.deploymentId)); }
    catch (error) { return sendUploadError(reply, error); }
  });
}

module.exports = uploadRoutes;
