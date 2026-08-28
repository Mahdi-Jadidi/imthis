-- Consolidate legacy plans without shortening paid access or changing payment history.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
UPDATE users SET plan = 'Annual' WHERE plan IN ('Standard', 'Premium');
ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan = 'Annual');

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
UPDATE subscriptions SET plan = 'Annual' WHERE plan IN ('Standard', 'Premium');
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan = 'Annual');

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_plan_check;
UPDATE payment_transactions SET plan = 'Annual' WHERE plan IN ('Standard', 'Premium');
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_plan_check CHECK (plan = 'Annual');

-- Accounts without a delivered/generated site remain drafts; existing trials and paid periods are preserved.
UPDATE subscriptions s
SET status = 'draft', site_status = 'draft', trial_started_at = NULL, trial_ends_at = NULL,
    grace_ends_at = NULL, updated_at = NOW()
WHERE COALESCE(is_paid, false) = false
  AND NOT EXISTS (SELECT 1 FROM deployments d WHERE d.user_id = s.user_id);

UPDATE domains SET full_url = 'https://' || slug || '.imthis.site/';
