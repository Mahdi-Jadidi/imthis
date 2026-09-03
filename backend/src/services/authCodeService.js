const crypto = require('node:crypto');
const { redis, connectRedis } = require('../config/redis');
const env = require('../config/env');

// Gmail can occasionally delay Inbox presentation even after Resend reports
// delivery. Keep the code usable during that delivery window.
const CODE_TTL_SECONDS = 30 * 60;
const RESEND_COOLDOWN_SECONDS = 2 * 60;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeCode(code) {
  return String(code || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[^0-9]/g, '');
}

function key(purpose, email) {
  return `auth:code:${purpose}:${normalizeEmail(email)}`;
}

function hashCode(purpose, email, code) {
  return crypto.createHmac('sha256', env.jwtSecret)
    .update(`${purpose}:${normalizeEmail(email)}:${code}`)
    .digest('hex');
}

async function issueCode(purpose, email, options = {}) {
  const client = await connectRedis();
  const normalizedEmail = normalizeEmail(email);
  const recordKey = key(purpose, normalizedEmail);
  const cooldownKey = `${recordKey}:cooldown`;
  if (!options.force && await client.exists(cooldownKey)) {
    const error = new Error('Please wait before requesting another code');
    error.statusCode = 429;
    throw error;
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await client.set(recordKey, JSON.stringify({ hash: hashCode(purpose, normalizedEmail, code), attempts: 0 }), { EX: CODE_TTL_SECONDS });
  await client.set(cooldownKey, '1', { EX: RESEND_COOLDOWN_SECONDS });
  return code;
}

async function verifyCode(purpose, email, code) {
  const client = await connectRedis();
  const normalizedEmail = normalizeEmail(email);
  const recordKey = key(purpose, normalizedEmail);
  const raw = await client.get(recordKey);
  if (!raw) return false;
  const record = JSON.parse(raw);
  if (Number(record.attempts || 0) >= MAX_ATTEMPTS) return false;

  const valid = crypto.timingSafeEqual(
    Buffer.from(record.hash),
    Buffer.from(hashCode(purpose, normalizedEmail, normalizeCode(code))),
  );
  if (!valid) {
    await client.set(recordKey, JSON.stringify({ ...record, attempts: Number(record.attempts || 0) + 1 }), { EX: CODE_TTL_SECONDS });
    return false;
  }

  await client.del(recordKey);
  return true;
}

module.exports = { issueCode, verifyCode, normalizeEmail, normalizeCode };
