-- Correct already-applied revenue migrations and close launch-safety gaps.
-- Paid records remain public; legacy arbitrary HTML deployments can never be published.
UPDATE deployments SET status = 'failed'
WHERE method = 'files' AND status IN ('pending', 'processing', 'draft', 'live');

WITH paid_sites AS (
  SELECT s.user_id
  FROM subscriptions s
  WHERE s.status = 'active'
    AND COALESCE(s.is_paid, false) = true
    AND (s.expires_at IS NULL OR s.expires_at > NOW())
), latest_generated AS (
  SELECT DISTINCT ON (d.user_id) d.id
  FROM deployments d
  JOIN paid_sites p ON p.user_id = d.user_id
  WHERE d.method <> 'files' AND d.status = 'draft'
  ORDER BY d.user_id, d.updated_at DESC, d.created_at DESC
)
UPDATE deployments d SET status = 'live', deployed_at = COALESCE(d.deployed_at, NOW())
FROM latest_generated lg WHERE d.id = lg.id
  AND NOT EXISTS (
    SELECT 1 FROM deployments current
    WHERE current.user_id = d.user_id AND current.status = 'live' AND current.method <> 'files'
  );

UPDATE domains dom SET is_active = true
WHERE EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.user_id = dom.user_id AND s.status = 'active' AND COALESCE(s.is_paid, false) = true
    AND (s.expires_at IS NULL OR s.expires_at > NOW())
)
AND EXISTS (
  SELECT 1 FROM deployments d
  WHERE d.user_id = dom.user_id AND d.status = 'live' AND d.method <> 'files'
);

UPDATE domains dom SET is_active = false
WHERE NOT EXISTS (
  SELECT 1 FROM deployments d
  WHERE d.user_id = dom.user_id AND d.status = 'live' AND d.method <> 'files'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_one_pending_per_user
  ON payment_transactions(user_id) WHERE status = 'pending';
