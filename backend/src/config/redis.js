const { createClient } = require('redis');
const env = require('./env');

const redis = createClient({
  url: env.redisUrl,
});

redis.on('error', (error) => {
  console.error('Redis client error', error);
});

async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }

  return redis;
}

module.exports = {
  redis,
  connectRedis,
};
