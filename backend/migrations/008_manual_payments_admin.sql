-- Card-to-card payment review workflow and audit fields.
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('pending', 'pending_review', 'verified', 'cancelled', 'failed', 'rejected'));

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS review_note TEXT;

DROP INDEX IF EXISTS idx_payment_transactions_one_pending_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_one_open_per_user
  ON payment_transactions(user_id) WHERE status IN ('pending', 'pending_review');

CREATE INDEX IF NOT EXISTS idx_payment_transactions_review_queue
  ON payment_transactions(status, created_at DESC);
