CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Stores platform login accounts for professionals.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  plan VARCHAR(20) NOT NULL
    CHECK (plan IN ('Standard', 'Premium')),
  user_type VARCHAR(20) NOT NULL
    CHECK (user_type IN ('professional')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false
);

-- Stores public resume/profile details for professional users.
CREATE TABLE professional_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  headline VARCHAR(500),
  city VARCHAR(100),
  country VARCHAR(100),
  languages TEXT[],
  job_title VARCHAR(255),
  company VARCHAR(255),
  industry VARCHAR(100),
  years_experience VARCHAR(20),
  seniority VARCHAR(50),
  skills TEXT[],
  open_to_work BOOLEAN DEFAULT false,
  availability VARCHAR(50),
  work_types TEXT[],
  linkedin_url VARCHAR(500),
  github_url VARCHAR(500),
  website_url VARCHAR(500),
  other_url VARCHAR(500),
  phone VARCHAR(50),
  bio TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores hosted profile domains and slug mappings for users.
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  full_url VARCHAR(255) NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (slug)
);

-- Stores upload and publishing deployment records.
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  domain_id UUID REFERENCES domains(id),
  method VARCHAR(20) NOT NULL
    CHECK (method IN ('files', 'pdf', 'docx', 'txt', 'story')),
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'live', 'failed')),
  minio_path VARCHAR(500),
  original_filename VARCHAR(255),
  file_size_bytes INTEGER,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores extracted, structured, and generated resume content.
CREATE TABLE parsed_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  deployment_id UUID REFERENCES deployments(id),
  source_type VARCHAR(20)
    CHECK (source_type IN ('pdf', 'docx', 'txt', 'story', 'manual')),
  raw_text TEXT,
  structured_json JSONB,
  generated_html TEXT,
  generated_cv_pdf_path VARCHAR(500),
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores Premium story questionnaire answers for AI-assisted CV generation.
CREATE TABLE story_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  q1_what_you_do TEXT,
  q2_achievements TEXT,
  q3_skills TEXT,
  q4_differentiator TEXT,
  q5_next_career TEXT,
  q6_extra TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores visit analytics events for hosted profile domains.
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES domains(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  visitor_ip_hash VARCHAR(64),
  country VARCHAR(100),
  city VARCHAR(100),
  referrer VARCHAR(500),
  user_agent TEXT,
  visited_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores subscription status, billing references, and plan periods.
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL
    CHECK (plan IN ('Standard', 'Premium')),
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  payment_reference VARCHAR(255),
  amount_paid INTEGER,
  currency VARCHAR(10) DEFAULT 'USD'
);

CREATE INDEX idx_professional_profiles_slug
  ON professional_profiles(slug);

CREATE INDEX idx_professional_profiles_industry
  ON professional_profiles(industry);

CREATE INDEX idx_professional_profiles_country
  ON professional_profiles(country);

CREATE INDEX idx_professional_profiles_seniority
  ON professional_profiles(seniority);

CREATE INDEX idx_professional_profiles_skills
  ON professional_profiles USING GIN(skills);

CREATE INDEX idx_analytics_events_domain
  ON analytics_events(domain_id);

CREATE INDEX idx_analytics_events_visited_at
  ON analytics_events(visited_at);

CREATE INDEX idx_deployments_user
  ON deployments(user_id);

CREATE INDEX idx_professional_profiles_fts
  ON professional_profiles
  USING GIN (
    to_tsvector(
      'english',
      coalesce(full_name, '') || ' ' ||
      coalesce(headline, '') || ' ' ||
      coalesce(job_title, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(country, '')
    )
  );
