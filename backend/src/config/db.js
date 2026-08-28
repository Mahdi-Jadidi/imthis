const { Client } = require('pg');
const env = require('./env');

function getServerlessDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname.endsWith('.aws.neon.tech') && !url.hostname.includes('-pooler.')) {
      url.hostname = url.hostname.replace(/^(ep-[^.]+)(\.)/, '$1-pooler$2');
    }
    return url.toString();
  } catch (_) {
    return value;
  }
}

const clientOptions = {
  connectionString: getServerlessDatabaseUrl(env.databaseUrl),
  connectionTimeoutMillis: 8_000,
  query_timeout: 12_000,
  statement_timeout: 12_000,
};

async function connect() {
  const client = new Client(clientOptions);
  await client.connect();
  // Preserve the pg-pool-compatible release method used throughout the app,
  // while ensuring a recycled Vercel worker never retains a closed client.
  client.release = () => client.end().catch(() => {});
  return client;
}

const pool = {
  async connect() {
    return connect();
  },
  async query(...args) {
    const client = await connect();
    try {
      return await client.query(...args);
    } finally {
      await client.release();
    }
  },
  async end() {},
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
