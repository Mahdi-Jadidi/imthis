const { connectRedis } = require('../config/redis');

function rateLimiter(options = {}) {
  const windowSeconds = options.windowSeconds || 60;
  const maxRequests = options.maxRequests || 60;
  const name = String(options.name || 'global').replace(/[^a-z0-9_-]/gi, '-');

  return async function rateLimitMiddleware(request, reply) {
    const identifier = request.ip || 'anonymous';
    const key = `rate-limit:${name}:${identifier}`;

    // TODO: Tune key strategy per route/user once route logic is implemented.
    const redis = await connectRedis();
    const currentCount = await redis.incr(key);

    if (currentCount === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (currentCount > maxRequests) {
      return reply.code(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded.',
      });
    }
  };
}

module.exports = rateLimiter;
