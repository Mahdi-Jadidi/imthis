const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { pool } = require('../config/db');
const {
  PaymentError,
  approveManualPayment,
  rejectManualPayment,
  expireManualPaymentRequests,
} = require('../services/paymentService');

const QA_EMAIL_DOMAIN = '%@test.imthis.site';
const SUBMITTED_MANUAL_PAYMENT_SQL = `(pt.status = 'pending_review' OR (
  pt.status = 'pending'
  AND pt.provider_response->>'method' = 'card_transfer'
  AND COALESCE(pt.provider_response->>'submitted_at', '') <> ''
))`;

async function getLaunchAudit() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_active = true) AS all_active_users,
      (SELECT COUNT(*)::int FROM users WHERE is_active = true AND email LIKE $1) AS qa_accounts,
      (SELECT COUNT(*)::int FROM users WHERE is_active = true AND email NOT LIKE $1) AS real_active_users,
      (SELECT COUNT(*)::int FROM deployments d JOIN users u ON u.id = d.user_id
        WHERE u.email NOT LIKE $1 AND d.status = 'live') AS live_deployments,
      (SELECT COUNT(*)::int FROM payment_transactions pt JOIN users u ON u.id = pt.user_id
        WHERE u.email NOT LIKE $1 AND ${SUBMITTED_MANUAL_PAYMENT_SQL}) AS real_pending_reviews
  `, [QA_EMAIL_DOMAIN]);
  return rows[0];
}

function sendError(reply, error) {
  if (!(error instanceof PaymentError)) reply.log.error(error, 'Admin operation failed');
  return reply.code(error instanceof PaymentError ? error.statusCode : 500).send({
    error: error instanceof PaymentError ? error.message : 'Internal server error',
  });
}

async function adminRoutes(fastify) {
  const guard = { preHandler: [requireAuth, requireAdmin] };
  fastify.get('/overview', guard, async function (request, reply) {
    await expireManualPaymentRequests();
    const [audit, overview] = await Promise.all([getLaunchAudit(), pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE is_active = true AND email NOT LIKE $1) AS total_users,
        (SELECT COUNT(*)::int FROM subscriptions s JOIN users u ON u.id = s.user_id
          WHERE u.email NOT LIKE $1 AND s.status = 'active' AND s.is_paid = true) AS active_subscriptions,
        (SELECT COUNT(*)::int FROM payment_transactions pt JOIN users u ON u.id = pt.user_id
          WHERE u.email NOT LIKE $1 AND ${SUBMITTED_MANUAL_PAYMENT_SQL}) AS pending_reviews,
        (SELECT COALESCE(SUM(pt.amount), 0)::bigint FROM payment_transactions pt JOIN users u ON u.id = pt.user_id
          WHERE u.email NOT LIKE $1 AND pt.status = 'verified') AS verified_revenue,
        (SELECT COUNT(*)::int FROM payment_transactions pt JOIN users u ON u.id = pt.user_id
          WHERE u.email NOT LIKE $1 AND pt.status = 'verified' AND pt.verified_at >= date_trunc('month', NOW())) AS approved_this_month
    `, [QA_EMAIL_DOMAIN])]);
    return reply.send({ overview: { ...overview.rows[0], launchAudit: audit } });
  });
  fastify.get('/launch-audit', guard, async function (request, reply) {
    return reply.send({ audit: await getLaunchAudit() });
  });
  fastify.post('/launch-audit/cleanup-qa', guard, async function (request, reply) {
    if (request.body?.confirmation !== 'DELETE_QA_ACCOUNTS') {
      return reply.code(400).send({ error: 'Confirmation is required to delete QA accounts' });
    }
    const { rows } = await pool.query(
      `DELETE FROM users WHERE email LIKE $1 RETURNING id`,
      [QA_EMAIL_DOMAIN],
    );
    return reply.send({ success: true, deletedQaAccounts: rows.length });
  });
  fastify.get('/payments', guard, async function (request, reply) {
    await expireManualPaymentRequests();
    const status = String(request.query?.status || 'pending_review');
    const allowed = ['pending', 'pending_review', 'verified', 'rejected', 'failed', 'cancelled', 'all'];
    if (!allowed.includes(status)) return reply.code(400).send({ error: 'Invalid status filter' });
    const params = status === 'all'
      ? [QA_EMAIL_DOMAIN]
      : (status === 'pending_review' ? [QA_EMAIL_DOMAIN] : [status, QA_EMAIL_DOMAIN]);
    const where = status === 'all'
      ? 'WHERE u.email NOT LIKE $1'
      : (status === 'pending_review'
        ? `WHERE ${SUBMITTED_MANUAL_PAYMENT_SQL} AND u.email NOT LIKE $1`
        : 'WHERE pt.status = $1 AND u.email NOT LIKE $2');
    const { rows } = await pool.query(
      `SELECT pt.id, pt.user_id, pt.plan, pt.amount, pt.currency, pt.status, pt.reference_id, pt.created_at, pt.updated_at,
       CASE WHEN pt.provider_response->>'method' = 'card_transfer'
         THEN pt.created_at + INTERVAL '24 hours' ELSE NULL END AS manual_expires_at,
       pt.provider_response, u.email, pp.full_name, u.created_at AS account_created_at
       FROM payment_transactions pt JOIN users u ON u.id = pt.user_id
       LEFT JOIN professional_profiles pp ON pp.user_id = u.id ${where}
       ORDER BY pt.created_at DESC LIMIT 100`, params,
    );
    return reply.send({ payments: rows.map((payment) => (
      status === 'pending_review' && payment.status === 'pending'
        ? { ...payment, status: 'pending_review' }
        : payment
    )) });
  });
  fastify.post('/payments/:id/approve', guard, async function (request, reply) {
    try { return reply.send(await approveManualPayment(request.params.id, request.user.email, request.body?.note)); }
    catch (error) { return sendError(reply, error); }
  });
  fastify.post('/payments/:id/reject', guard, async function (request, reply) {
    try { return reply.send(await rejectManualPayment(request.params.id, request.user.email, request.body?.note)); }
    catch (error) { return sendError(reply, error); }
  });
}
module.exports = adminRoutes;
