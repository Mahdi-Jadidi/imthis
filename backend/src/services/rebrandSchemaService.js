const { pool } = require('../config/db');

const REBRAND_MIGRATION = '011_imthis_rebrand.sql';
const SITE_REQUEST_MIGRATION = '010_manual_site_requests.sql';
const REBRAND_LOCK = 'imthis-rebrand-schema-v1';

const REBRAND_SQL = `
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
  UPDATE users SET plan = 'Annual' WHERE plan IN ('Standard', 'Premium');
  ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan = 'Annual');

  ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
  UPDATE subscriptions SET plan = 'Annual' WHERE plan IN ('Standard', 'Premium');
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan = 'Annual');

  ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_plan_check;
  UPDATE payment_transactions SET plan = 'Annual' WHERE plan IN ('Standard', 'Premium');
  ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_plan_check CHECK (plan = 'Annual');

  UPDATE subscriptions s
  SET status = 'draft', site_status = 'draft', trial_started_at = NULL, trial_ends_at = NULL,
      grace_ends_at = NULL, updated_at = NOW()
  WHERE COALESCE(is_paid, false) = false
    AND NOT EXISTS (SELECT 1 FROM deployments d WHERE d.user_id = s.user_id);

  UPDATE domains SET full_url = 'https://' || slug || '.imthis.site/';
`;

const SITE_REQUEST_SQL = `
  CREATE TABLE IF NOT EXISTS manual_site_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brief JSONB NOT NULL DEFAULT '{}'::jsonb,
    resume_path VARCHAR(500),
    resume_filename VARCHAR(255),
    resume_mimetype VARCHAR(120),
    resume_size_bytes INTEGER,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    delivered_deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
    admin_note TEXT,
    delivered_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE manual_site_requests ADD COLUMN IF NOT EXISTS brief JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE manual_site_requests ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE manual_site_requests ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
  ALTER TABLE manual_site_requests ALTER COLUMN resume_path DROP NOT NULL;
  ALTER TABLE manual_site_requests ALTER COLUMN resume_filename DROP NOT NULL;
  ALTER TABLE manual_site_requests ALTER COLUMN resume_mimetype DROP NOT NULL;
  ALTER TABLE manual_site_requests ALTER COLUMN resume_size_bytes DROP NOT NULL;
  ALTER TABLE manual_site_requests DROP CONSTRAINT IF EXISTS manual_site_requests_status_check;
  UPDATE manual_site_requests SET status = 'delivered', delivered_at = COALESCE(delivered_at, completed_at)
  WHERE status = 'completed';
  ALTER TABLE manual_site_requests ADD CONSTRAINT manual_site_requests_status_check
    CHECK (status IN ('draft', 'queued', 'in_progress', 'delivered', 'cancelled'));
  CREATE INDEX IF NOT EXISTS idx_manual_site_requests_queue
    ON manual_site_requests(status, created_at ASC);
`;

let migrationPromise;

async function applyMigration(client, filename, sql) {
  const applied = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename],
  );
  if (applied.rowCount > 0) return false;
  await client.query(sql);
  await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
  return true;
}

async function applyRebrandMigration(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [REBRAND_LOCK]);

  const siteRequestsApplied = await applyMigration(client, SITE_REQUEST_MIGRATION, SITE_REQUEST_SQL);
  const rebrandApplied = await applyMigration(client, REBRAND_MIGRATION, REBRAND_SQL);
  return siteRequestsApplied || rebrandApplied;
}

async function ensureRebrandSchema() {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async function runMigration() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const applied = await applyRebrandMigration(client);
      await client.query('COMMIT');
      if (applied) console.log('Applied I’m This annual-plan database migration');
    } catch (error) {
      await client.query('ROLLBACK');
      migrationPromise = undefined;
      throw error;
    } finally {
      client.release();
    }
  })();

  return migrationPromise;
}

module.exports = {
  REBRAND_MIGRATION,
  SITE_REQUEST_MIGRATION,
  REBRAND_SQL,
  SITE_REQUEST_SQL,
  applyRebrandMigration,
  ensureRebrandSchema,
};
