-- Drop the retired recruiter/discovery marketplace schema and normalize
-- the remaining MVP schema to professional-only users.

UPDATE users
SET user_type = 'professional'
WHERE user_type IS DISTINCT FROM 'professional';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ALTER COLUMN user_type SET DEFAULT 'professional';
ALTER TABLE users
  ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('professional'));

DROP TABLE IF EXISTS shortlists CASCADE;
DROP TABLE IF EXISTS contact_unlocks CASCADE;
DROP TABLE IF EXISTS recruiter_projects CASCADE;
DROP TABLE IF EXISTS recruiter_profiles CASCADE;
