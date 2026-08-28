const { redis } = require('../config/redis');

const LIMITS = Object.freeze({
  convert: 5,
  regenerate: 10,
});

const ACTIONS = new Set(Object.keys(LIMITS));

function normalizeAction(action) {
  return ACTIONS.has(action) ? action : 'convert';
}

function getMonthBucket(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getResetAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function buildKey(userId, action, now = new Date()) {
  return `dropcv:conversion:${normalizeAction(action)}:${userId}:${getMonthBucket(now)}`;
}

function buildUsage(used, limit, resetAt) {
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: resetAt.toISOString(),
  };
}

function toCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function createConversionLimiter(client = redis) {
  async function getUsage(userId, now = new Date()) {
    const resetAt = getResetAt(now);
    const keys = Object.keys(LIMITS).map((action) => buildKey(userId, action, now));
    const counts = await client.mGet(keys);

    return Object.keys(LIMITS).reduce((usage, action, index) => {
      const used = toCount(counts?.[index]);
      usage[action] = buildUsage(used, LIMITS[action], resetAt);
      return usage;
    }, {});
  }

  async function reserve(userId, action = 'convert', now = new Date()) {
    const normalizedAction = normalizeAction(action);
    const key = buildKey(userId, normalizedAction, now);
    const limit = LIMITS[normalizedAction];
    const resetAt = getResetAt(now);
    const ttlSeconds = Math.max(60, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));

    const lua = `
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      local limit = tonumber(ARGV[1])
      if current >= limit then
        return {0, current}
      end
      current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
      end
      return {1, current}
    `;

    const result = await client.eval(lua, {
      keys: [key],
      arguments: [String(limit), String(ttlSeconds)],
    });

    const allowed = Number(result?.[0] ?? result?.allowed ?? 0);
    const used = toCount(result?.[1] ?? result?.used);

    if (!allowed) {
      const error = new Error(`Monthly ${normalizedAction} limit reached`);
      error.statusCode = 429;
      error.code = 'CONVERSION_LIMIT_REACHED';
      error.limit = normalizedAction;
      error.usage = buildUsage(used, limit, resetAt);
      throw error;
    }

    return {
      action: normalizedAction,
      key,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetAt: resetAt.toISOString(),
    };
  }

  async function refund(reservation) {
    if (!reservation?.key) return;
    const current = toCount(await client.get(reservation.key));
    if (current <= 0) return;

    await client.decr(reservation.key);
  }

  return {
    getUsage,
    reserve,
    refund,
  };
}

const limiter = createConversionLimiter();

module.exports = {
  LIMITS,
  createConversionLimiter,
  getMonthBucket,
  getResetAt,
  buildKey,
  buildUsage,
  normalizeAction,
  getUsage: limiter.getUsage,
  reserve: limiter.reserve,
  refund: limiter.refund,
};
