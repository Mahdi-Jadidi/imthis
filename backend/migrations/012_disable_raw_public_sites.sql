-- Never expose arbitrary user HTML/JavaScript on the primary imthis.site
-- domain. Clean up legacy rows and enforce the rule for future writes.
-- Preserve our own generated resume pages, but move them out of the legacy
-- raw-file method before adding the database guard below.
UPDATE deployments d
SET method = 'story', updated_at = NOW()
WHERE d.method = 'files'
  AND EXISTS (
    SELECT 1 FROM parsed_content pc
    WHERE pc.deployment_id = d.id AND pc.ai_generated = true
  );

UPDATE deployments
SET status = 'failed', updated_at = NOW()
WHERE method = 'files' AND status IN ('pending', 'processing', 'draft', 'live');

UPDATE domains dom
SET is_active = false
WHERE NOT EXISTS (
  SELECT 1 FROM deployments d
  WHERE d.user_id = dom.user_id
    AND d.status = 'live'
    AND d.method <> 'files'
);

ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_no_live_file_sites;
ALTER TABLE deployments ADD CONSTRAINT deployments_no_live_file_sites
  CHECK (NOT (method = 'files' AND status = 'live'));
