const { pool } = require('../config/db');
const billingService = require('../services/billingService');
const { sendExpirationNotice, sendRenewalReminder } = require('../services/mailService');

const ONE_HOUR_MS = 60 * 60 * 1000;

async function runExpiryCycle() {
  const reminders = await pool.query(
    `SELECT s.user_id, s.expires_at, u.email, d.full_url
     FROM subscriptions s JOIN users u ON u.id = s.user_id
     LEFT JOIN domains d ON d.user_id = s.user_id AND d.is_primary = true
     WHERE s.status = 'active' AND s.renewal_reminder_sent IS NOT TRUE
       AND s.expires_at BETWEEN NOW() + INTERVAL '6 days' AND NOW() + INTERVAL '7 days'`,
  );
  for (const row of reminders.rows) {
    try {
      const claimed = await pool.query(
        'UPDATE subscriptions SET renewal_reminder_sent = true WHERE user_id = $1 AND renewal_reminder_sent IS NOT TRUE RETURNING user_id',
        [row.user_id],
      );
      if (!claimed.rows[0]) continue;
      await sendRenewalReminder({ email: row.email, url: row.full_url, expiresAt: row.expires_at });
    } catch (error) {
      await pool.query('UPDATE subscriptions SET renewal_reminder_sent = false WHERE user_id = $1', [row.user_id]).catch(() => {});
      console.error(`[mail] renewal reminder failed for user ${row.user_id}`, error);
    }
  }

  const { rows } = await pool.query(
    `SELECT s.user_id, u.email, d.full_url
     FROM subscriptions s JOIN users u ON u.id = s.user_id
     LEFT JOIN domains d ON d.user_id = s.user_id AND d.is_primary = true
     WHERE s.status = 'active' AND s.expires_at <= NOW()`,
  );
  for (const row of rows) {
    const expired = await billingService.expireSubscription(row.user_id);
    if (!expired) continue;
    sendExpirationNotice({ email: row.email, url: row.full_url }).catch((error) => {
      console.error('[mail] expiration notice failed', error);
    });
  }
}

function startSubscriptionExpiry() {
  const timer = setInterval(() => runExpiryCycle().catch(console.error), ONE_HOUR_MS);
  if (typeof timer.unref === 'function') timer.unref();
  runExpiryCycle().catch(console.error);
  return timer;
}

module.exports = { runExpiryCycle, startSubscriptionExpiry };
