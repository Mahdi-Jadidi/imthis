-- Standardize trial duration to 3 days for existing trial subscriptions.
UPDATE subscriptions
SET trial_ends_at = COALESCE(trial_started_at, started_at, NOW()) + INTERVAL '3 days'
WHERE site_status = 'trial'
  AND (
    trial_ends_at IS NULL
    OR trial_ends_at > COALESCE(trial_started_at, started_at, NOW()) + INTERVAL '3 days'
  );
