const bcrypt = require('bcrypt');
const slugify = require('slugify');
const { createHash } = require('node:crypto');
const { pool } = require('../config/db');
const { redis } = require('../config/redis');
const { buildPublicSiteUrl, getSlugRestriction } = require('../config/publicSite');

const BCRYPT_ROUNDS = 12;
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const VALID_PLANS = ['Annual'];
const VALID_USER_TYPES = ['professional'];
const DOMAIN_COUNTS_BY_PLAN = {
  Annual: 1,
};

class AuthError extends Error {
  constructor(message, statusCode = 400, field) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.field = field;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeSlug(slug) {
  return slugify(String(slug || ''), {
    lower: true,
    strict: true,
    trim: true,
  });
}

function buildSlugSuggestions(slug) {
  const base = normalizeSlug(slug).slice(0, 52);
  if (!base) return [];

  return [
    `${base}-me`,
    `${base}-site`,
    `my-${base}`,
    `${base}-${new Date().getUTCFullYear()}`,
  ]
    .map((candidate) => normalizeSlug(candidate).slice(0, 63).replace(/-+$/g, ''))
    .filter((candidate, index, candidates) => candidate.length >= 4
      && !getSlugRestriction(candidate)
      && candidates.indexOf(candidate) === index);
}

async function findUnavailableSlugs(client, slugs) {
  if (slugs.length === 0) return new Set();

  const { rows } = await client.query(
    `SELECT dom.slug
     FROM domains dom
     WHERE dom.slug = ANY($1::varchar[])
       AND dom.is_active = true`,
    [slugs],
  );

  return new Set(rows.map((row) => row.slug));
}

async function checkSlugAvailability(inputSlug) {
  const slug = normalizeSlug(inputSlug);
  if (slug.length < 4 || slug.length > 63) {
    throw new AuthError('Address must be between 4 and 63 characters', 400, 'slug');
  }

  const candidates = [slug, ...buildSlugSuggestions(slug)];
  const unavailable = await findUnavailableSlugs(pool, candidates);
  const restriction = getSlugRestriction(slug);
  const available = !restriction && !unavailable.has(slug);
  const suggestions = available
    ? []
    : candidates.slice(1).filter((candidate) => !getSlugRestriction(candidate) && !unavailable.has(candidate)).slice(0, 3);

  return {
    slug,
    available,
    reason: restriction || (unavailable.has(slug) ? 'taken' : null),
    url: buildPublicSiteUrl(slug),
    suggestions: suggestions.map((candidate) => ({
      slug: candidate,
      url: buildPublicSiteUrl(candidate),
    })),
  };
}

function getFirstName(fullName = '') {
  return String(fullName).trim().split(/\s+/)[0] || null;
}

function getRevokedTokenKey(token) {
  const digest = createHash('sha256').update(String(token || '')).digest('hex');
  return `auth:revoked:${digest}`;
}

function getLegacyRevokedTokenKey(token) {
  return `auth:revoked:${token}`;
}

function getTokenTtlSeconds(decodedToken) {
  const expiresAtSeconds = Number(decodedToken?.exp || 0);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (expiresAtSeconds > nowSeconds) {
    return expiresAtSeconds - nowSeconds;
  }

  return COOKIE_MAX_AGE_SECONDS;
}

function assertValidRegistrationInput(input) {
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  const plan = input.plan;
  const userType = input.userType;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('Invalid email format', 400, 'email');
  }

  if (password.length < 8) {
    throw new AuthError('Password must be at least 8 characters', 400, 'password');
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new AuthError('Password must be at most 72 UTF-8 bytes', 400, 'password');
  }

  if (!VALID_PLANS.includes(plan)) {
    throw new AuthError('Invalid plan', 400, 'plan');
  }

  if (!VALID_USER_TYPES.includes(userType)) {
    throw new AuthError('Invalid user type', 400, 'userType');
  }

  if (userType === 'professional' && !normalizeSlug(input.slug)) {
    throw new AuthError('Slug is required', 400, 'slug');
  }

  const slug = normalizeSlug(input.slug);
  const slugRestriction = getSlugRestriction(slug);
  if (slugRestriction) {
    throw new AuthError(
      slugRestriction === 'too_short' ? 'Address must be at least 4 characters' : 'This address is reserved',
      409,
      'slug',
    );
  }

  return {
    email,
    password,
    plan,
    userType,
    slug,
  };
}

function buildProfessionalProfile(input, slug) {
  const profile = input.professionalProfile || {};
  const fullName = profile.fullName || profile.full_name || input.name || slug;

  return {
    full_name: fullName,
    slug,
    headline: profile.headline || null,
    city: profile.city || null,
    country: profile.country || null,
    languages: profile.languages || null,
    job_title: profile.jobTitle || profile.job_title || null,
    company: profile.company || null,
    industry: profile.industry || null,
    years_experience: profile.yearsExperience || profile.years_experience || null,
    seniority: profile.seniority || null,
    skills: profile.skills || null,
    open_to_work: profile.openToWork ?? profile.open_to_work ?? false,
    availability: profile.availability || null,
    work_types: profile.workTypes || profile.work_types || null,
    linkedin_url: profile.linkedinUrl || profile.linkedin_url || null,
    github_url: profile.githubUrl || profile.github_url || null,
    website_url: profile.websiteUrl || profile.website_url || null,
    other_url: profile.otherUrl || profile.other_url || null,
    phone: profile.phone || null,
    bio: profile.bio || null,
    is_public: false,
  };
}

function buildDomainRows({ plan, slug, profile }) {
  const domainCount = DOMAIN_COUNTS_BY_PLAN[plan] || 0;

  if (domainCount === 0) {
    return [];
  }

  const firstName = getFirstName(profile.full_name);
  const lastName = String(profile.full_name).trim().split(/\s+/).slice(-1)[0];
  const nameSlug = normalizeSlug(`${firstName}-${lastName}`);
  const candidates = [
    slug,
    // The original fallback used only the person's name here, which caused
    // repeat test registrations to collide on a shared secondary domain like
    // "dr-mahdi.imthis.site" even when the requested primary slug was unique.
    `${slug}-${nameSlug}`,
    `${slug}-cv`,
    `${slug}-resume`,
    `${slug}-${Date.now()}`,
  ];
  const uniqueSlugs = [];

  for (const candidate of candidates) {
    const domainSlug = normalizeSlug(candidate);

    if (domainSlug && !uniqueSlugs.includes(domainSlug)) {
      uniqueSlugs.push(domainSlug);
    }

    if (uniqueSlugs.length === domainCount) {
      break;
    }
  }

  return uniqueSlugs.map((domainSlug, index) => ({
    slug: domainSlug,
    full_url: buildPublicSiteUrl(domainSlug),
    is_primary: index === 0,
  }));
}

async function assertEmailAvailable(client, email) {
  const { rowCount } = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);

  if (rowCount > 0) {
    throw new AuthError('Email is already registered', 409, 'email');
  }
}

async function assertSlugsAvailable(client, slugs) {
  if (slugs.length === 0) {
    return;
  }

  if (slugs.some((slug) => getSlugRestriction(slug))) {
    throw new AuthError('This address is reserved', 409, 'slug');
  }

  const unavailable = await findUnavailableSlugs(client, slugs);
  if (unavailable.size > 0) {
    throw new AuthError('Slug is already taken', 409, 'slug');
  }
}

async function insertProfessionalProfile(client, userId, profile) {
  const { rows } = await client.query(
    `INSERT INTO professional_profiles (
      user_id, full_name, slug, headline, city, country, languages, job_title,
      company, industry, years_experience, seniority, skills, open_to_work,
      availability, work_types, linkedin_url, github_url, website_url, other_url,
      phone, bio, is_public
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20,
      $21, $22, $23
    ) RETURNING *`,
    [
      userId,
      profile.full_name,
      profile.slug,
      profile.headline,
      profile.city,
      profile.country,
      profile.languages,
      profile.job_title,
      profile.company,
      profile.industry,
      profile.years_experience,
      profile.seniority,
      profile.skills,
      profile.open_to_work,
      profile.availability,
      profile.work_types,
      profile.linkedin_url,
      profile.github_url,
      profile.website_url,
      profile.other_url,
      profile.phone,
      profile.bio,
      profile.is_public,
    ],
  );

  return rows[0];
}

async function insertDomains(client, userId, domains) {
  for (const domain of domains) {
    await client.query(
      `INSERT INTO domains (user_id, slug, full_url, is_primary, is_active)
       VALUES ($1, $2, $3, $4, false)`,
      [userId, domain.slug, domain.full_url, domain.is_primary],
    );
  }
}

async function registerUser(input) {
  const validated = assertValidRegistrationInput(input);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await assertEmailAvailable(client, validated.email);

    const profile = buildProfessionalProfile(input, validated.slug);
    const domains = buildDomainRows({
      plan: validated.plan,
      slug: validated.slug,
      profile,
    });

    await assertSlugsAvailable(client, domains.map((domain) => domain.slug));

    const passwordHash = await bcrypt.hash(validated.password, BCRYPT_ROUNDS);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, password_hash, plan, user_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, plan, user_type`,
      [validated.email, passwordHash, validated.plan, validated.userType],
    );
    const user = userRows[0];

    const insertedProfile = await insertProfessionalProfile(client, user.id, profile);

    await insertDomains(client, user.id, domains);
    await client.query(
      `INSERT INTO subscriptions (
        user_id, plan, status, is_paid, site_status, currency,
        trial_started_at, trial_ends_at, grace_ends_at, day3_reminder_sent
      ) VALUES ($1, $2, 'draft', false, 'draft', 'IRT', NULL, NULL, NULL, false)`,
      [user.id, validated.plan],
    );

    await client.query('COMMIT');

    return {
      id: user.id,
      email: user.email,
      plan: user.plan,
      userType: user.user_type,
      slug: domains[0]?.slug || null,
      publicUrl: domains[0]?.slug ? buildPublicSiteUrl(domains[0].slug) : null,
      firstName: getFirstName(insertedProfile.full_name),
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      if (error.constraint?.includes('email')) {
        throw new AuthError('Email is already registered', 409, 'email');
      }

      if (error.constraint?.includes('slug')) {
        throw new AuthError('Slug is already taken', 409, 'slug');
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

async function loginUser(input) {
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');

  if (!email || !password || Buffer.byteLength(password, 'utf8') > 72) {
    throw new AuthError('Invalid credentials', 401);
  }

  const { rows } = await pool.query(
    `SELECT id, email, password_hash, plan, user_type, email_verified
     FROM users
     WHERE email = $1 AND is_active = true
     LIMIT 1`,
    [email],
  );
  const user = rows[0];

  if (!user) {
    throw new AuthError('Invalid credentials', 401);
  }

  if (!user.email_verified) {
    throw new AuthError('Please verify your email before signing in', 403, 'email');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw new AuthError('Invalid credentials', 401);
  }

  await pool.query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

  const profile = await getProfileForUser(user.id, user.user_type);
  const domain = await getPrimaryDomain(user.id);

  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    userType: user.user_type,
    slug: domain?.slug || profile?.slug || null,
    publicUrl: domain?.slug ? buildPublicSiteUrl(domain.slug) : null,
    firstName: getFirstName(profile?.full_name),
    profileComplete: Boolean(profile),
  };
}

async function getPrimaryDomain(userId) {
  const { rows } = await pool.query(
    `SELECT slug, full_url
     FROM domains
     WHERE user_id = $1 AND is_primary = true AND is_active = true
     LIMIT 1`,
    [userId],
  );

  return rows[0] || null;
}

async function getProfileForUser(userId) {
  const { rows } = await pool.query('SELECT * FROM professional_profiles WHERE user_id = $1 LIMIT 1', [userId]);

  return rows[0] || null;
}

async function getUserById(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, plan, user_type, created_at, updated_at, last_login,
      is_active, email_verified
     FROM users
     WHERE id = $1 AND is_active = true
     LIMIT 1`,
    [userId],
  );
  const user = rows[0];

  if (!user) {
    throw new AuthError('User not found', 404);
  }

  const profile = await getProfileForUser(user.id, user.user_type);
  const domain = await getPrimaryDomain(user.id);

  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    userType: user.user_type,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLogin: user.last_login,
    isActive: user.is_active,
    emailVerified: user.email_verified,
    slug: domain?.slug || profile?.slug || null,
    publicUrl: domain?.slug ? buildPublicSiteUrl(domain.slug) : null,
    firstName: getFirstName(profile?.full_name),
    profile,
  };
}

async function revokeToken(token, decodedToken) {
  if (!token) {
    return;
  }

  await redis.set(getRevokedTokenKey(token), '1', {
    EX: getTokenTtlSeconds(decodedToken),
  });
}

async function isTokenRevoked(token) {
  if (!token) {
    return false;
  }

  const [hashed, legacy] = await Promise.all([
    redis.exists(getRevokedTokenKey(token)),
    redis.exists(getLegacyRevokedTokenKey(token)),
  ]);
  return hashed === 1 || legacy === 1;
}

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, email, email_verified FROM users WHERE email = $1 AND is_active = true LIMIT 1',
    [normalizeEmail(email)],
  );
  return rows[0] || null;
}

async function verifyEmail(email) {
  const { rows } = await pool.query(
    'UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1 AND is_active = true RETURNING id',
    [normalizeEmail(email)],
  );
  return rows[0] ? getUserById(rows[0].id) : null;
}

module.exports = {
  AuthError,
  normalizeSlug,
  buildSlugSuggestions,
  checkSlugAvailability,
  registerUser,
  loginUser,
  getUserById,
  getUserByEmail,
  verifyEmail,
  revokeToken,
  isTokenRevoked,
};
