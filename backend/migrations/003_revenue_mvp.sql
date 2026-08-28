-- Revenue-ready MVP: canonical plans, private drafts, and ZarinPal transactions.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
UPDATE users SET plan = CASE WHEN plan = 'Premium' THEN 'Premium' ELSE 'Standard' END;
ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('Standard', 'Premium'));

ALTER TABLE professional_profiles ALTER COLUMN is_public SET DEFAULT false;
UPDATE professional_profiles SET is_public = false;
UPDATE domains SET is_active = false WHERE user_id IN (
  SELECT user_id FROM subscriptions WHERE COALESCE(is_paid, false) = false
);

ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_status_check;
UPDATE deployments d SET status = 'draft'
WHERE d.status = 'live'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = d.user_id
      AND COALESCE(s.is_paid, false) = true
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  );
ALTER TABLE deployments ADD CONSTRAINT deployments_status_check
  CHECK (status IN ('pending', 'processing', 'draft', 'live', 'failed'));

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_site_status_check;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
UPDATE subscriptions SET plan = CASE WHEN plan = 'Premium' THEN 'Premium' ELSE 'Standard' END;
UPDATE subscriptions SET status = CASE
  WHEN COALESCE(is_paid, false) = true AND (expires_at IS NULL OR expires_at > NOW()) THEN 'active'
  WHEN COALESCE(trial_ends_at, COALESCE(started_at, NOW()) + INTERVAL '3 days') > NOW() THEN 'trial'
  WHEN COALESCE(grace_ends_at, COALESCE(trial_ends_at, COALESCE(started_at, NOW()) + INTERVAL '3 days') + INTERVAL '3 days') > NOW() THEN 'expired'
  WHEN COALESCE(is_paid, false) = true THEN 'expired'
  ELSE 'released'
END;
UPDATE subscriptions SET site_status = CASE
  WHEN COALESCE(is_paid, false) = true AND (expires_at IS NULL OR expires_at > NOW()) THEN 'active'
  WHEN COALESCE(trial_ends_at, COALESCE(started_at, NOW()) + INTERVAL '3 days') > NOW() THEN 'trial'
  WHEN COALESCE(grace_ends_at, COALESCE(trial_ends_at, COALESCE(started_at, NOW()) + INTERVAL '3 days') + INTERVAL '3 days') > NOW() THEN 'offline_grace'
  WHEN COALESCE(is_paid, false) = true THEN 'expired'
  ELSE 'released'
END;
UPDATE subscriptions SET updated_at = COALESCE(updated_at, NOW());
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('Standard', 'Premium'));
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('draft', 'trial', 'active', 'expired', 'released'));
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_site_status_check
  CHECK (site_status IN ('draft', 'trial', 'active', 'offline_grace', 'expired', 'released'));
ALTER TABLE subscriptions ALTER COLUMN currency SET DEFAULT 'IRT';

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL CHECK (plan IN ('Standard', 'Premium')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'IRT' CHECK (currency = 'IRT'),
  authority VARCHAR(64) UNIQUE,
  reference_id VARCHAR(100) UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'cancelled', 'failed')),
  provider_response JSONB,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_authority ON payment_transactions(authority);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_one_pending_per_user
  ON payment_transactions(user_id) WHERE status = 'pending';

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_reminder_sent BOOLEAN DEFAULT false;
