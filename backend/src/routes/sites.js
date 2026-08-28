const requireAuth = require('../middleware/requireAuth');
const billingService = require('../services/billingService');
const { UploadError } = require('../services/uploadService');
const { uploadWebsiteBundle } = require('../services/siteUploadService');
const env = require('../config/env');
const siteGenerationLimiter = require('../services/siteGenerationLimiter');
const { pool } = require('../config/db');

function sendSiteError(reply, error) {
  if (error instanceof UploadError || typeof error.statusCode === 'number') {
    const body = { error: error.message };

    if (error.field) {
      body.field = error.field;
    }

    return reply.code(error.statusCode).send(body);
  }

  if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
    return reply.code(413).send({ error: 'File is too large' });
  }

  console.error('Site upload route error', error);
  return reply.code(500).send({ error: 'Internal server error' });
}

async function siteRoutes(fastify) {
  fastify.post('/upload', {
    preHandler: requireAuth,
  }, async function uploadSiteHandler(request, reply) {
    let reservation = null;
    try {
      const lifecycle = await billingService.checkSiteStatus(request.user.userId);
      if (!['draft', 'trial', 'active'].includes(lifecycle.status)) {
        return reply.code(402).send({
          error: 'An active trial or subscription is required',
          upgradeUrl: '/signup.html',
        });
      }

      const result = await uploadWebsiteBundle(request, request.user.userId, {
        allowResumeConversion: env.aiSiteGenerationEnabled,
        onResumeConversion: async () => {
          reservation = await siteGenerationLimiter.reserve(request.user.userId, lifecycle);
          return reservation.usage;
        },
      });
      const client = await pool.connect();
      let subscription;
      try {
        await client.query('BEGIN');
        subscription = await billingService.startTrial(client, request.user.userId, result.deploymentId);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return reply.code(201).send({
        ...result,
        trialStartedAt: subscription.trial_started_at,
        trialEndsAt: subscription.trial_ends_at,
      });
    } catch (error) {
      if (reservation) await siteGenerationLimiter.refund(reservation).catch(() => {});
      return sendSiteError(reply, error);
    }
  });

  fastify.get('/mine', { preHandler: requireAuth }, async function listSitesHandler(request, reply) {
    const { rows } = await pool.query(
      `SELECT d.id, d.status, d.method, d.original_filename, d.file_size_bytes,
              d.created_at, d.updated_at, d.deployed_at, dom.full_url
       FROM deployments d
       LEFT JOIN domains dom ON dom.id = d.domain_id
       WHERE d.user_id = $1
       ORDER BY d.updated_at DESC, d.created_at DESC`,
      [request.user.userId],
    );
    return reply.send({ sites: rows });
  });

  fastify.post('/:deploymentId/publish', { preHandler: requireAuth }, async function publish(request, reply) {
    const changed = await billingService.publishSite(request.user.userId, request.params.deploymentId);
    if (!changed) return reply.code(409).send({ error: 'An active subscription and private draft are required' });
    return reply.send({ success: true, status: 'live' });
  });

  fastify.post('/:deploymentId/unpublish', { preHandler: requireAuth }, async function unpublish(request, reply) {
    const changed = await billingService.unpublishSite(request.user.userId, request.params.deploymentId);
    if (!changed) return reply.code(404).send({ error: 'Published site not found' });
    return reply.send({ success: true, status: 'draft' });
  });
}

module.exports = siteRoutes;
