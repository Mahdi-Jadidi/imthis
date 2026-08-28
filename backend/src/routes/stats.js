const { pool } = require('../config/db');

async function statsRoutes(fastify) {
  fastify.get('/public', async function publicStatsHandler(request, reply) {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(DISTINCT d.user_id)::int AS total_published_sites
         FROM deployments d
         JOIN subscriptions s ON s.user_id = d.user_id
         WHERE d.status = 'live'
           AND COALESCE(s.site_status, s.status) IN ('trial', 'active')`,
      );

      return { totalPublishedSites: rows[0]?.total_published_sites || 0 };
    } catch (error) {
      request.log.error(error, 'Could not load public stats');
      return reply.code(500).send({ error: 'Public stats are temporarily unavailable' });
    }
  });
}

module.exports = statsRoutes;
