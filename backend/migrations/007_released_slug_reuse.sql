-- Released sites keep their archived rows, but only active/public rows should
-- block a slug from being reused by a new registration.
ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_slug_key;
DROP INDEX IF EXISTS domains_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_slug_active
  ON domains(slug)
  WHERE is_active = true;

ALTER TABLE professional_profiles DROP CONSTRAINT IF EXISTS professional_profiles_slug_key;
DROP INDEX IF EXISTS professional_profiles_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_profiles_slug_public
  ON professional_profiles(slug)
  WHERE is_public = true;
