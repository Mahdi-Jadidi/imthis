const crypto = require('crypto');
const { pool } = require('../config/db');
const { redis, connectRedis } = require('../config/redis');
const env = require('../config/env');

class AnalyticsError extends Error {
  constructor(message, statusCode = 400, field) {
    super(message);
    this.name = 'AnalyticsError';
    this.statusCode = statusCode;
    this.field = field;
  }
}

function hashVisitorIp(ip) {
  return crypto.createHash('sha256').update(`${ip}${env.jwtSecret}`).digest('hex');
}

function buildGeoLookupUrl(ip) {
  const template = String(process.env.ANALYTICS_GEO_LOOKUP_URL || '').trim();
  if (!template) return null;
  const rawUrl = template.includes('{ip}')
    ? template.replace(/\{ip\}/g, encodeURIComponent(ip))
    : template;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch (error) {
    return null;
  }
}

async function getGeoForIp(ip) {
  try {
    if (!ip || ip === '127.0.0.1' || ip === '::1') {
      return { country: null, city: null };
    }

    const geoLookupUrl = buildGeoLookupUrl(ip);
    if (!geoLookupUrl) {
      return { country: null, city: null };
    }

    const response = await fetch(geoLookupUrl, {
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return { country: null, city: null };
    }

    const data = await response.json();

    return {
      country: data.country || null,
      city: data.city || null,
    };
  } catch (error) {
    return { country: null, city: null };
  }
}

async function trackAnalyticsEvent({ domainSlug, ip, referrer, userAgent, skipGeo = false }) {
  if (!domainSlug) {
    throw new AnalyticsError('domainSlug is required', 400, 'domainSlug');
  }

  const { rows } = await pool.query(
    `SELECT id, user_id
     FROM domains
     WHERE slug = $1 AND is_active = true
     LIMIT 1`,
    [domainSlug],
  );
  const domain = rows[0];

  if (!domain) {
    throw new AnalyticsError('Domain not found', 404, 'domainSlug');
  }

  const ipHash = hashVisitorIp(ip || '');
  const rateLimitKey = `analytics:${domainSlug}:${ipHash}`;

  await connectRedis();
  const inserted = await redis.set(rateLimitKey, '1', {
    NX: true,
    EX: 3600,
  });

  if (!inserted) {
    return { success: true, rateLimited: true };
  }

  const geo = skipGeo ? { country: null, city: null } : await getGeoForIp(ip);

  await pool.query(
    `INSERT INTO analytics_events (
      domain_id, user_id, visitor_ip_hash, country, city, referrer, user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      domain.id,
      domain.user_id,
      ipHash,
      geo.country,
      geo.city,
      referrer || null,
      userAgent || null,
    ],
  );

  return { success: true };
}

async function logProfileView({ userId, domainId, ip, referrer, userAgent }) {
  const ipHash = hashVisitorIp(ip || '');

  await pool.query(
    `INSERT INTO analytics_events (
      domain_id, user_id, visitor_ip_hash, referrer, user_agent
    ) VALUES ($1, $2, $3, $4, $5)`,
    [domainId || null, userId, ipHash, referrer || null, userAgent || null],
  );
}

function getLastSevenDays() {
  const days = [];

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - index);
    days.push(date.toISOString().slice(0, 10));
  }

  return days;
}

async function getAnalyticsDashboard(userId) {
  const { rows: domainRows } = await pool.query(
    `SELECT id
     FROM domains
     WHERE user_id = $1 AND is_active = true`,
    [userId],
  );
  const domainIds = domainRows.map((row) => row.id);

  if (domainIds.length === 0) {
    return {
      totalViews: 0,
      viewsThisWeek: 0,
      viewsLast7Days: getLastSevenDays().map((date) => ({ date, count: 0 })),
      topCountries: [],
      topReferrers: [],
      uniqueVisitors: 0,
      bestDay: null,
    };
  }

  const [totals, chart, countries, referrers, bestDay] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*)::int AS total_views,
        COUNT(*) FILTER (WHERE visited_at >= NOW() - INTERVAL '7 days')::int AS views_this_week,
        COUNT(DISTINCT visitor_ip_hash)::int AS unique_visitors
       FROM analytics_events
       WHERE domain_id = ANY($1::uuid[])`,
      [domainIds],
    ),
    pool.query(
      `SELECT DATE(visited_at)::text AS date, COUNT(*)::int AS count
       FROM analytics_events
       WHERE domain_id = ANY($1::uuid[])
        AND visited_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(visited_at)
       ORDER BY date ASC`,
      [domainIds],
    ),
    pool.query(
      `SELECT COALESCE(country, 'Unknown') AS country, COUNT(*)::int AS count
       FROM analytics_events
       WHERE domain_id = ANY($1::uuid[])
       GROUP BY COALESCE(country, 'Unknown')
       ORDER BY count DESC
       LIMIT 5`,
      [domainIds],
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(referrer, ''), 'Direct') AS referrer, COUNT(*)::int AS count
       FROM analytics_events
       WHERE domain_id = ANY($1::uuid[])
       GROUP BY COALESCE(NULLIF(referrer, ''), 'Direct')
       ORDER BY count DESC
       LIMIT 5`,
      [domainIds],
    ),
    pool.query(
      `SELECT DATE(visited_at)::text AS date, COUNT(*)::int AS count
       FROM analytics_events
       WHERE domain_id = ANY($1::uuid[])
       GROUP BY DATE(visited_at)
       ORDER BY count DESC, date DESC
       LIMIT 1`,
      [domainIds],
    ),
  ]);

  const countsByDate = new Map(chart.rows.map((row) => [row.date, row.count]));

  return {
    totalViews: totals.rows[0].total_views,
    viewsThisWeek: totals.rows[0].views_this_week,
    viewsLast7Days: getLastSevenDays().map((date) => ({
      date,
      count: countsByDate.get(date) || 0,
    })),
    topCountries: countries.rows,
    topReferrers: referrers.rows,
    uniqueVisitors: totals.rows[0].unique_visitors,
    bestDay: bestDay.rows[0]?.date || null,
  };
}

module.exports = {
  AnalyticsError,
  trackAnalyticsEvent,
  logProfileView,
  getAnalyticsDashboard,
};
