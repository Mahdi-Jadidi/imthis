ALTER TABLE subscriptions
  ADD COLUMN trial_started_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN trial_ends_at TIMESTAMPTZ,
  ADD COLUMN grace_ends_at TIMESTAMPTZ,
  ADD COLUMN is_paid BOOLEAN DEFAULT false,
  ADD COLUMN site_status VARCHAR(20) DEFAULT 'trial'
    CHECK (site_status IN ('draft', 'trial', 'active', 'offline_grace', 'expired', 'released')),
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN day3_reminder_sent BOOLEAN DEFAULT false;

UPDATE subscriptions
SET trial_started_at = COALESCE(trial_started_at, started_at, NOW()),
    trial_ends_at = COALESCE(trial_ends_at, COALESCE(started_at, NOW()) + INTERVAL '3 days'),
    grace_ends_at = COALESCE(
      grace_ends_at,
      CASE
        WHEN COALESCE(is_paid, false) = false THEN COALESCE(trial_started_at, started_at, NOW()) + INTERVAL '6 days'
        ELSE NULL
      END
    ),
    is_paid = COALESCE(is_paid, false),
    site_status = CASE
      WHEN COALESCE(is_paid, false) = true AND (expires_at IS NULL OR expires_at > NOW()) THEN 'active'
      WHEN COALESCE(trial_ends_at, COALESCE(started_at, NOW()) + INTERVAL '3 days') > NOW() THEN 'trial'
      WHEN COALESCE(grace_ends_at, COALESCE(trial_ends_at, COALESCE(started_at, NOW()) + INTERVAL '3 days') + INTERVAL '3 days') > NOW() THEN 'offline_grace'
      WHEN COALESCE(is_paid, false) = true THEN 'expired'
      ELSE 'released'
    END
WHERE trial_ends_at IS NULL
   OR site_status IS NULL
   OR trial_started_at IS NULL;

CREATE INDEX idx_subscriptions_trial_ends
  ON subscriptions(trial_ends_at)
  WHERE site_status = 'trial';

CREATE INDEX idx_subscriptions_grace_ends
  ON subscriptions(grace_ends_at)
  WHERE site_status = 'offline_grace';
