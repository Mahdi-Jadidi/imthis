const { pool } = require('../config/db');
const billingService = require('../services/billingService');
const { sendTrialEndingReminder } = require('../services/mailService');

const ONE_HOUR_MS = 60 * 60 * 1000;

async function runTrialLifecycleCycle() {
  const reminders = await pool.query(
    `SELECT s.user_id, COALESCE(s.trial_ends_at, s.started_at + INTERVAL '3 days') AS trial_ends_at, s.started_at, u.email, d.full_url
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN domains d ON d.user_id = s.user_id AND d.is_primary = true
     WHERE COALESCE(s.site_status, s.status) = 'trial'
       AND s.day3_reminder_sent IS NOT TRUE
       AND COALESCE(s.trial_ends_at, s.started_at + INTERVAL '3 days')
         BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'`,
  );

  for (const row of reminders.rows) {
    try {
      const claimed = await pool.query(
        'UPDATE subscriptions SET day3_reminder_sent = true WHERE user_id = $1 AND day3_reminder_sent IS NOT TRUE RETURNING user_id',
        [row.user_id],
      );
      if (!claimed.rows[0]) continue;
      await sendTrialEndingReminder({
        email: row.email,
        url: row.full_url,
        expiresAt: row.trial_ends_at,
      });
    } catch (error) {
      await pool.query('UPDATE subscriptions SET day3_reminder_sent = false WHERE user_id = $1', [row.user_id]).catch(() => {});
      console.error(`[mail] trial reminder failed for user ${row.user_id}`, error);
    }
  }

  const expiredTrials = await pool.query(
    `SELECT s.user_id
     FROM subscriptions s
     WHERE COALESCE(s.site_status, s.status) = 'trial'
       AND COALESCE(s.trial_ends_at, s.started_at + INTERVAL '3 days') <= NOW()`,
  );

  for (const row of expiredTrials.rows) {
    try {
      await billingService.transitionTrialToGrace(row.user_id);
    } catch (error) {
      console.error(`[billing] could not move trial to grace for user ${row.user_id}`, error);
    }
  }

  const graceExpired = await pool.query(
    `SELECT s.user_id
     FROM subscriptions s
     WHERE COALESCE(s.site_status, s.status) = 'offline_grace'
       AND COALESCE(s.grace_ends_at, COALESCE(s.trial_ends_at, s.started_at + INTERVAL '3 days') + INTERVAL '1 day') <= NOW()`,
  );

  for (const row of graceExpired.rows) {
    try {
      await billingService.transitionGraceToReleased(row.user_id);
    } catch (error) {
      console.error(`[billing] could not release user ${row.user_id}`, error);
    }
  }
}

function startTrialLifecycle() {
  const timer = setInterval(() => runTrialLifecycleCycle().catch(console.error), ONE_HOUR_MS);
  if (typeof timer.unref === 'function') timer.unref();
  runTrialLifecycleCycle().catch(console.error);
  return timer;
}

module.exports = { runTrialLifecycleCycle, startTrialLifecycle };
