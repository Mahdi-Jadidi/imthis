const { pool } = require('../config/db');
const { buildPublicSiteUrl } = require('../config/publicSite');
const { minioClient, bucketName, deleteFile } = require('../config/minio');

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DURATION_DAYS = 3;
const GRACE_DURATION_DAYS = 1;

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  if (!date) return null;
  return new Date(date.getTime() + (days * DAY_MS));
}

function daysRemaining(target, now = new Date()) {
  const end = toDate(target);
  if (!end) return null;

  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 0;

  return Math.max(1, Math.round(diff / DAY_MS));
}

function computeSubscriptionLifecycle(subscription, now = new Date()) {
  if (!subscription) {
    return {
      status: 'draft',
      siteStatus: 'draft',
      daysLeft: null,
      trialStartedAt: null,
      trialEndsAt: null,
      graceEndsAt: null,
      expiresAt: null,
      isPaid: false,
      plan: null,
      archivedAt: null,
    };
  }

  const trialStartedAt = toDate(subscription.trial_started_at);
  const trialEndsAt = toDate(subscription.trial_ends_at) || addDays(trialStartedAt, TRIAL_DURATION_DAYS);
  const graceEndsAt = toDate(subscription.grace_ends_at) || addDays(trialEndsAt, GRACE_DURATION_DAYS);
  const expiresAt = toDate(subscription.expires_at);
  const isPaid = Boolean(subscription.is_paid);
  const storedStatus = String(subscription.status || '').toLowerCase();
  const storedSiteStatus = String(subscription.site_status || '').toLowerCase();

  if (
    storedStatus === 'released' ||
    storedSiteStatus === 'released' ||
    (toDate(subscription.archived_at) && graceEndsAt && graceEndsAt <= now)
  ) {
    return {
      status: 'released',
      siteStatus: 'released',
      daysLeft: 0,
      trialStartedAt,
      trialEndsAt,
      graceEndsAt,
      expiresAt,
      isPaid,
      plan: subscription.plan || null,
      archivedAt: subscription.archived_at || null,
    };
  }

  if (isPaid && expiresAt && expiresAt <= now) {
    return {
      status: 'expired',
      siteStatus: 'expired',
      daysLeft: 0,
      trialStartedAt,
      trialEndsAt,
      graceEndsAt,
      expiresAt,
      isPaid,
      plan: subscription.plan || null,
      archivedAt: subscription.archived_at || null,
    };
  }

  if (!isPaid && trialEndsAt && trialEndsAt > now) {
    return {
      status: 'trial',
      siteStatus: 'trial',
      daysLeft: daysRemaining(trialEndsAt, now),
      trialStartedAt,
      trialEndsAt,
      graceEndsAt,
      expiresAt,
      isPaid,
      plan: subscription.plan || null,
      archivedAt: subscription.archived_at || null,
    };
  }

  if (!isPaid && trialEndsAt && trialEndsAt <= now) {
    if (graceEndsAt && graceEndsAt > now) {
      return {
        status: 'offline_grace',
        siteStatus: 'offline_grace',
        daysLeft: daysRemaining(graceEndsAt, now),
        trialStartedAt,
        trialEndsAt,
        graceEndsAt,
        expiresAt,
        isPaid,
        plan: subscription.plan || null,
        archivedAt: subscription.archived_at || null,
      };
    }

    return {
      status: 'released',
      siteStatus: 'released',
      daysLeft: 0,
      trialStartedAt,
      trialEndsAt,
      graceEndsAt,
      expiresAt,
      isPaid,
      plan: subscription.plan || null,
      archivedAt: subscription.archived_at || null,
    };
  }

  if (!isPaid && graceEndsAt && graceEndsAt > now) {
    return {
      status: 'offline_grace',
      siteStatus: 'offline_grace',
      daysLeft: daysRemaining(graceEndsAt, now),
      trialStartedAt,
      trialEndsAt,
      graceEndsAt,
      expiresAt,
      isPaid,
      plan: subscription.plan || null,
      archivedAt: subscription.archived_at || null,
    };
  }

  if (isPaid && (!expiresAt || expiresAt > now)) {
    return {
      status: 'active',
      siteStatus: 'active',
      daysLeft: daysRemaining(expiresAt, now),
      trialStartedAt,
      trialEndsAt,
      graceEndsAt: null,
      expiresAt,
      isPaid,
      plan: subscription.plan || null,
      archivedAt: subscription.archived_at || null,
    };
  }

  if (storedStatus === 'expired' || storedSiteStatus === 'expired') {
    return {
      status: 'expired',
      siteStatus: 'expired',
      daysLeft: 0,
      trialStartedAt,
      trialEndsAt,
      graceEndsAt,
      expiresAt,
      isPaid,
      plan: subscription.plan || null,
      archivedAt: subscription.archived_at || null,
    };
  }

  const fallbackStatus = storedSiteStatus || storedStatus || 'draft';
  return {
    status: fallbackStatus,
    siteStatus: fallbackStatus,
    daysLeft: null,
    trialStartedAt,
    trialEndsAt,
    graceEndsAt,
    expiresAt,
    isPaid,
    plan: subscription.plan || null,
    archivedAt: subscription.archived_at || null,
  };
}

async function getSubscription(userId) {
  const { rows } = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1 LIMIT 1', [userId]);
  return rows[0] || null;
}

async function checkSiteStatus(userId, now = new Date()) {
  const subscription = await getSubscription(userId);
  return computeSubscriptionLifecycle(subscription, now);
}

async function deactivatePublicSite(userId) {
  await pool.query(
    `UPDATE deployments
     SET status = 'draft', updated_at = NOW()
     WHERE user_id = $1 AND method <> 'files' AND status = 'live'`,
    [userId],
  );
  await pool.query('UPDATE domains SET is_active = false WHERE user_id = $1', [userId]);
  await pool.query('UPDATE professional_profiles SET is_public = false, updated_at = NOW() WHERE user_id = $1', [userId]);
}

async function activateSubscription(client, userId, plan, referenceId, amount) {
  const eligible = await client.query(
    `SELECT id, status FROM deployments
     WHERE user_id = $1 AND status IN ('draft', 'live')
     ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
    [userId],
  );

  const { rows } = await client.query(
    `UPDATE subscriptions SET plan = $2, status = 'active', site_status = 'active', is_paid = true,
      started_at = CASE WHEN status = 'active' THEN started_at ELSE NOW() END,
      trial_started_at = COALESCE(trial_started_at, started_at, NOW()),
      trial_ends_at = COALESCE(trial_ends_at, COALESCE(trial_started_at, started_at, NOW()) + INTERVAL '3 days'),
      grace_ends_at = NULL,
      expires_at = GREATEST(COALESCE(expires_at, NOW()), NOW()) + INTERVAL '1 year', payment_reference = $3,
      amount_paid = $4, currency = 'IRT', archived_at = NULL, day3_reminder_sent = true,
      renewal_reminder_sent = false, updated_at = NOW()
     WHERE user_id = $1 RETURNING *`,
    [userId, plan, referenceId, amount],
  );

  await client.query('UPDATE users SET plan = $2, updated_at = NOW() WHERE id = $1', [userId, plan]);
  if (!rows[0]) throw new Error('Subscription record not found');
  if (eligible.rows[0]?.status === 'draft') {
    await client.query(
      `UPDATE deployments SET status = 'live', deployed_at = COALESCE(deployed_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [eligible.rows[0].id],
    );
  }
  const domainResult = await client.query(
    'SELECT id, slug FROM domains WHERE user_id = $1 AND is_primary = true LIMIT 1 FOR UPDATE',
    [userId],
  );
  const domain = domainResult.rows[0];
  if (domain) {
    let candidate = domain.slug;
    let suffix = 0;
    while (true) {
      const conflict = await client.query(
        `SELECT 1 FROM domains WHERE slug = $1 AND is_active = true AND user_id <> $2
         UNION ALL
         SELECT 1 FROM professional_profiles WHERE slug = $1 AND is_public = true AND user_id <> $2
         LIMIT 1`,
        [candidate, userId],
      );
      if (!conflict.rows[0]) break;
      suffix += 1;
      const discriminator = String(userId).replace(/-/g, '').slice(0, 8);
      const tail = suffix === 1 ? `-${discriminator}` : `-${discriminator}-${suffix}`;
      candidate = `${domain.slug.slice(0, 100 - tail.length)}${tail}`;
    }
    if (candidate !== domain.slug) {
      await client.query('UPDATE domains SET slug = $2, full_url = $3 WHERE id = $1', [domain.id, candidate, buildPublicSiteUrl(candidate)]);
      await client.query('UPDATE professional_profiles SET slug = $2, updated_at = NOW() WHERE user_id = $1', [userId, candidate]);
    }
  }
  await client.query('UPDATE domains SET is_active = true WHERE user_id = $1', [userId]);
  await client.query('UPDATE professional_profiles SET is_public = true, updated_at = NOW() WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

async function transitionTrialToGrace(userId) {
  const { rowCount } = await pool.query(
    `UPDATE subscriptions
     SET status = 'expired',
       site_status = 'offline_grace',
       is_paid = false,
       grace_ends_at = COALESCE(grace_ends_at, COALESCE(trial_ends_at, trial_started_at, started_at, NOW()) + INTERVAL '1 day'),
       archived_at = NULL,
       updated_at = NOW()
     WHERE user_id = $1 AND COALESCE(site_status, status) = 'trial'`,
    [userId],
  );

  if (rowCount === 0) return false;

  await deactivatePublicSite(userId);
  return true;
}

async function deleteDeploymentStorage(deployments) {
  for (const deployment of deployments) {
    if (!deployment.minio_path) continue;
    if (deployment.method !== 'files') {
      await deleteFile(deployment.minio_path).catch(() => {});
      continue;
    }
    const objectNames = [];
    const stream = minioClient.listObjectsV2(bucketName, `${deployment.minio_path}/`, true);
    for await (const object of stream) objectNames.push(object.name);
    if (objectNames.length) await minioClient.removeObjects(bucketName, objectNames);
    else await deleteFile(deployment.minio_path).catch(() => {});
  }
}

async function transitionGraceToReleased(userId) {
  const { rowCount } = await pool.query(
    `UPDATE subscriptions
     SET status = 'released',
       site_status = 'released',
       is_paid = false,
       archived_at = COALESCE(archived_at, NOW()),
       updated_at = NOW()
     WHERE user_id = $1 AND COALESCE(site_status, status) = 'offline_grace'`,
    [userId],
  );

  if (rowCount === 0) return false;

  const client = await pool.connect();
  let deployments = [];
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, method, minio_path FROM deployments WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    deployments = result.rows;
    await client.query('DELETE FROM parsed_content WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM deployments WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM domains WHERE user_id = $1', [userId]);
    const releasedSlug = `released-${String(userId).replace(/[^a-z0-9]/gi, '').slice(0, 32)}`;
    await client.query(
      'UPDATE professional_profiles SET slug = $2, is_public = false, updated_at = NOW() WHERE user_id = $1',
      [userId, releasedSlug],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await deleteDeploymentStorage(deployments).catch((error) => {
    console.error(`[billing] could not remove released site storage for user ${userId}`, error);
  });
  return true;
}

async function expireSubscription(userId) {
  const { rowCount } = await pool.query(
    `UPDATE subscriptions
     SET status = 'expired', site_status = 'expired', is_paid = false, updated_at = NOW()
     WHERE user_id = $1 AND status = 'active'`,
    [userId],
  );
  if (rowCount === 0) return false;
  await deactivatePublicSite(userId);
  return true;
}

async function ensureTrialStarted(userId) {
  await pool.query(
    `UPDATE subscriptions
     SET status = CASE WHEN is_paid THEN 'active' ELSE 'trial' END,
       site_status = CASE WHEN is_paid THEN 'active' ELSE 'trial' END,
       trial_started_at = CASE WHEN is_paid THEN trial_started_at ELSE COALESCE(trial_started_at, NOW()) END,
       trial_ends_at = CASE WHEN is_paid THEN trial_ends_at ELSE COALESCE(trial_ends_at, NOW() + INTERVAL '3 days') END,
       day3_reminder_sent = false, updated_at = NOW()
     WHERE user_id = $1 AND COALESCE(site_status, status) = 'draft'`,
    [userId],
  );
  return checkSiteStatus(userId);
}

async function startTrial(client, userId, deploymentId) {
  const subscriptionResult = await client.query(
    `UPDATE subscriptions
     SET status = CASE WHEN is_paid THEN 'active' ELSE 'trial' END,
       site_status = CASE WHEN is_paid THEN 'active' ELSE 'trial' END,
       trial_started_at = CASE WHEN is_paid THEN trial_started_at ELSE COALESCE(trial_started_at, NOW()) END,
       trial_ends_at = CASE WHEN is_paid THEN trial_ends_at ELSE COALESCE(trial_ends_at, NOW() + INTERVAL '3 days') END,
       grace_ends_at = NULL, archived_at = NULL, day3_reminder_sent = false, updated_at = NOW()
     WHERE user_id = $1 RETURNING *`,
    [userId],
  );
  if (!subscriptionResult.rows[0]) throw new Error('Subscription record not found');

  await client.query(
    `UPDATE deployments SET status = 'draft', updated_at = NOW()
     WHERE user_id = $1 AND id <> $2 AND status = 'live'`,
    [userId, deploymentId],
  );
  await client.query(
    `UPDATE deployments SET status = 'live', deployed_at = COALESCE(deployed_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [deploymentId, userId],
  );
  await client.query('UPDATE domains SET is_active = true WHERE user_id = $1', [userId]);
  await client.query('UPDATE professional_profiles SET is_public = true, updated_at = NOW() WHERE user_id = $1', [userId]);
  return subscriptionResult.rows[0];
}

async function unpublishSite(userId, deploymentId) {
  const { rows } = await pool.query(
    `UPDATE deployments SET status = 'draft', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'live' RETURNING id`,
    [deploymentId, userId],
  );
  if (!rows[0]) return false;
  await pool.query('UPDATE domains SET is_active = false WHERE user_id = $1', [userId]);
  await pool.query('UPDATE professional_profiles SET is_public = false, updated_at = NOW() WHERE user_id = $1', [userId]);
  return true;
}

async function publishSite(userId, deploymentId, now = new Date()) {
  const lifecycle = await checkSiteStatus(userId, now);
  if (!['trial', 'active'].includes(lifecycle.status)) return false;

  const { rows } = await pool.query(
    `UPDATE deployments SET status = 'live', deployed_at = COALESCE(deployed_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND method <> 'files' AND status IN ('draft', 'live') RETURNING id`,
    [deploymentId, userId],
  );
  if (!rows[0]) return false;
  await pool.query('UPDATE domains SET is_active = true WHERE user_id = $1', [userId]);
  await pool.query('UPDATE professional_profiles SET is_public = true, updated_at = NOW() WHERE user_id = $1', [userId]);
  return true;
}

module.exports = {
  DAY_MS,
  TRIAL_DURATION_DAYS,
  GRACE_DURATION_DAYS,
  getSubscription,
  computeSubscriptionLifecycle,
  checkSiteStatus,
  ensureTrialStarted,
  startTrial,
  activateSubscription,
  transitionTrialToGrace,
  transitionGraceToReleased,
  expireSubscription,
  unpublishSite,
  publishSite,
};
