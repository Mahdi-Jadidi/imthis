const requireAuth = require('../middleware/requireAuth');
const { getUserById } = require('../services/authService');
const billingService = require('../services/billingService');
const conversionLimiter = require('../services/conversionLimiter');
const bcrypt = require('bcrypt');
const { createHash, randomBytes } = require('node:crypto');
const { pool } = require('../config/db');
const env = require('../config/env');
const rateLimiter = require('../middleware/rateLimiter');
const { sendEmailChangeConfirmation } = require('../services/mailService');
const { minioClient, bucketName, deleteFile } = require('../config/minio');

function passwordIsValid(password) {
  return typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password, 'utf8') <= 72;
}

async function deleteStoredDeployment(deployment) {
  if (!deployment.minio_path) return;
  if (deployment.method !== 'files') {
    await deleteFile(deployment.minio_path).catch(() => {});
    return;
  }
  const names = [];
  const stream = minioClient.listObjectsV2(bucketName, `${deployment.minio_path}/`, true);
  for await (const object of stream) names.push(object.name);
  if (names.length) await minioClient.removeObjects(bucketName, names);
}

async function userRoutes(fastify) {
  fastify.get('/me', { preHandler: requireAuth }, async function getCurrentUserHandler(request, reply) {
    const user = await getUserById(request.user.userId);
    const subscription = await billingService.checkSiteStatus(request.user.userId);
    const db = require('../config/db').pool;
    const { rows } = await db.query(
      `SELECT id, status FROM deployments WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [request.user.userId],
    );
    return reply.send({
      success: true,
      user: {
        ...user,
        subscription,
        latestDeployment: rows[0] || null,
        publicUrl: ['trial', 'active'].includes(subscription.status) ? user.publicUrl || null : null,
        draftUrl: rows[0] ? `/api/preview/${rows[0].id}` : null,
        paymentState: subscription.status === 'active'
          ? 'paid'
          : (subscription.status === 'trial' ? 'trial' : 'required'),
      },
    });
  });

  fastify.get('/site-status', { preHandler: requireAuth }, async function getSiteStatusHandler(request, reply) {
    const result = await billingService.checkSiteStatus(request.user.userId);
    return reply.send(result);
  });

  fastify.get('/conversion-usage', { preHandler: requireAuth }, async function getConversionUsageHandler(request, reply) {
    const usage = await conversionLimiter.getUsage(request.user.userId);
    return reply.send({
      success: true,
      usage,
    });
  });

  fastify.patch('/settings', { preHandler: requireAuth }, async function updateSettingsHandler(request, reply) {
    const fullName = String(request.body?.fullName || '').trim();
    if (!fullName || fullName.length > 255) return reply.code(400).send({ error: 'A valid full name is required' });
    await pool.query('UPDATE professional_profiles SET full_name = $2, updated_at = NOW() WHERE user_id = $1', [request.user.userId, fullName]);
    return reply.send({ success: true, user: await getUserById(request.user.userId) });
  });

  fastify.post('/password', { preHandler: [requireAuth, rateLimiter({ name: 'change-password', maxRequests: 5, windowSeconds: 3600 })] }, async function changePasswordHandler(request, reply) {
    const currentPassword = String(request.body?.currentPassword || '');
    const newPassword = String(request.body?.newPassword || '');
    if (!passwordIsValid(newPassword)) return reply.code(400).send({ error: 'New password must be 8-72 UTF-8 bytes' });
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1 AND is_active = true', [request.user.userId]);
    if (!result.rows[0] || !(await bcrypt.compare(currentPassword, result.rows[0].password_hash))) {
      return reply.code(403).send({ error: 'Current password is incorrect' });
    }
    await pool.query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [request.user.userId, await bcrypt.hash(newPassword, 12)]);
    return reply.send({ success: true });
  });

  fastify.post('/email-change', { preHandler: [requireAuth, rateLimiter({ name: 'email-change', maxRequests: 3, windowSeconds: 3600 })] }, async function requestEmailChangeHandler(request, reply) {
    const newEmail = String(request.body?.newEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 255) return reply.code(400).send({ error: 'A valid email is required' });
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [newEmail, request.user.userId]);
    if (existing.rows[0]) return reply.code(409).send({ error: 'Email is already in use' });
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO email_change_tokens (user_id, token_hash, new_email, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')
       ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, new_email = EXCLUDED.new_email,
       expires_at = EXCLUDED.expires_at, created_at = NOW()`,
      [request.user.userId, tokenHash, newEmail],
    );
    const confirmationUrl = `${env.frontendUrl.replace(/\/$/, '')}/settings-email-confirm.html?token=${encodeURIComponent(token)}`;
    await sendEmailChangeConfirmation({ email: newEmail, confirmationUrl });
    return reply.send({ success: true });
  });

  fastify.post('/email-change/confirm', { preHandler: rateLimiter({ name: 'confirm-email', maxRequests: 10, windowSeconds: 3600 }) }, async function confirmEmailChangeHandler(request, reply) {
    const tokenHash = createHash('sha256').update(String(request.body?.token || '')).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM email_change_tokens WHERE token_hash = $1 AND expires_at > NOW() FOR UPDATE', [tokenHash]);
      const change = result.rows[0];
      if (!change) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'Confirmation link is invalid or expired' });
      }
      await client.query('UPDATE users SET email = $2, email_verified = true, updated_at = NOW() WHERE id = $1', [change.user_id, change.new_email]);
      await client.query('DELETE FROM email_change_tokens WHERE user_id = $1', [change.user_id]);
      await client.query('COMMIT');
      return reply.send({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return reply.code(409).send({ error: 'Email is already in use' });
      throw error;
    } finally {
      client.release();
    }
  });

  fastify.delete('/account', { preHandler: [requireAuth, rateLimiter({ name: 'delete-account', maxRequests: 3, windowSeconds: 3600 })] }, async function deleteAccountHandler(request, reply) {
    if (request.body?.confirmation !== 'DELETE') return reply.code(400).send({ error: 'Type DELETE to confirm account deletion' });
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [request.user.userId]);
    if (!result.rows[0] || !(await bcrypt.compare(String(request.body?.password || ''), result.rows[0].password_hash))) {
      return reply.code(403).send({ error: 'Password is incorrect' });
    }
    const deployments = await pool.query('SELECT method, minio_path FROM deployments WHERE user_id = $1', [request.user.userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [request.user.userId]);
    await Promise.all(deployments.rows.map((deployment) => deleteStoredDeployment(deployment).catch((error) => {
      console.error('Account object cleanup failed', error);
    })));
    reply.clearCookie('dropcv_token', { path: '/' });
    return reply.send({ success: true });
  });
}

module.exports = userRoutes;
