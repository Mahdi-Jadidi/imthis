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
