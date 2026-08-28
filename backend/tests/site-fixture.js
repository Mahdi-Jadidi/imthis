const { pool } = require('../src/config/db');
const { getPlan } = require('../src/config/plans');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForParsedContent(deploymentId, { attempts = 30, delayMs = 1000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { rows } = await pool.query(
      `SELECT deployment_id, source_type, structured_json, generated_html, created_at
       FROM parsed_content
       WHERE deployment_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [deploymentId],
    );

    if (rows[0]?.generated_html) {
      return rows[0];
    }

    await delay(delayMs);
  }

  return null;
}

async function promoteDraftDeployment({ userId, deploymentId, planName = 'Annual' }) {
  const plan = getPlan(planName) || getPlan('Annual');
  const parsedContent = await waitForParsedContent(deploymentId);

  if (!parsedContent) {
    throw new Error(`Parsed content not ready for deployment ${deploymentId}`);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const subscriptionResult = await client.query(
      `UPDATE subscriptions
       SET plan = $2,
         status = 'active',
         site_status = 'active',
         is_paid = true,
         started_at = COALESCE(started_at, NOW()),
         expires_at = GREATEST(COALESCE(expires_at, NOW()), NOW()) + INTERVAL '1 year',
         payment_reference = COALESCE(payment_reference, $3),
         amount_paid = $4,
         currency = $5,
         archived_at = NULL,
         renewal_reminder_sent = false
       WHERE user_id = $1
       RETURNING id`,
      [
        userId,
        planName,
        `TEST-${String(deploymentId).slice(0, 8)}`,
        plan.amount,
        plan.currency,
      ],
    );

    if (subscriptionResult.rowCount === 0) {
      throw new Error(`Subscription record not found for user ${userId}`);
    }

    await client.query(
      `UPDATE deployments
       SET status = 'live',
         deployed_at = COALESCE(deployed_at, NOW()),
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [deploymentId, userId],
    );

    await client.query('UPDATE domains SET is_active = true WHERE user_id = $1', [userId]);
    await client.query('UPDATE professional_profiles SET is_public = true, updated_at = NOW() WHERE user_id = $1', [userId]);

    await client.query('COMMIT');

    return parsedContent;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  waitForParsedContent,
  promoteDraftDeployment,
};
