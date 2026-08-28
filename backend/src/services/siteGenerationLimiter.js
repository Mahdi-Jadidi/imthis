const { redis } = require('../config/redis');

const TRIAL_LIMIT = 2;
const ACTIVE_WEEKLY_LIMIT = 3;

function getWeekBucket(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function getNextWeekStart(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + (8 - day));
  return date;
}

function getTrialBucket(lifecycle) {
  const start = new Date(lifecycle?.trialStartedAt || lifecycle?.trialEndsAt || Date.now());
  return Number.isNaN(start.getTime()) ? 'trial' : start.toISOString().slice(0, 10);
}

function getWindow(lifecycle, now = new Date()) {
  if (lifecycle?.status === 'trial') {
    const resetAt = new Date(lifecycle.trialEndsAt);
    return {
      keyPart: `trial:${getTrialBucket(lifecycle)}`,
      limit: TRIAL_LIMIT,
      resetAt: Number.isNaN(resetAt.getTime()) ? new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000)) : resetAt,
      label: 'trial',
    };
  }

  return {
    keyPart: `week:${getWeekBucket(now)}`,
    limit: ACTIVE_WEEKLY_LIMIT,
    resetAt: getNextWeekStart(now),
    label: 'week',
  };
}

function buildKey(userId, lifecycle, now = new Date()) {
  return `dropcv:site-generation:${userId}:${getWindow(lifecycle, now).keyPart}`;
}

function buildUsage(used, window) {
  return {
    used,
    limit: window.limit,
    remaining: Math.max(0, window.limit - used),
    resetAt: window.resetAt.toISOString(),
    period: window.label,
  };
}

function toCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function createSiteGenerationLimiter(client = redis) {
  async function reserve(userId, lifecycle, now = new Date()) {
    const window = getWindow(lifecycle, now);
    const key = buildKey(userId, lifecycle, now);
    const ttlSeconds = Math.max(60, Math.ceil((window.resetAt.getTime() - now.getTime()) / 1000));
    const result = await client.eval(`
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      local limit = tonumber(ARGV[1])
      if current >= limit then return {0, current} end
      current = redis.call('INCR', KEYS[1])
      if current == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2])) end
      return {1, current}
    `, { keys: [key], arguments: [String(window.limit), String(ttlSeconds)] });
    const used = toCount(result?.[1] ?? result?.used);
    if (!Number(result?.[0] ?? result?.allowed ?? 0)) {
      const error = new Error(window.label === 'trial'
        ? 'Trial site generation limit reached'
        : 'Weekly site generation limit reached');
      error.statusCode = 429;
      error.code = 'SITE_GENERATION_LIMIT_REACHED';
      error.usage = buildUsage(used, window);
      throw error;
    }
    return { key, usage: buildUsage(used, window) };
  }

  async function refund(reservation) {
    if (!reservation?.key) return;
    if (toCount(await client.get(reservation.key)) > 0) await client.decr(reservation.key);
  }

  return { reserve, refund };
}

const limiter = createSiteGenerationLimiter();

module.exports = {
  TRIAL_LIMIT,
  ACTIVE_WEEKLY_LIMIT,
  getWeekBucket,
  getNextWeekStart,
  getWindow,
  buildKey,
  createSiteGenerationLimiter,
  reserve: limiter.reserve,
  refund: limiter.refund,
};
