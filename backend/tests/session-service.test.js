const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  NODE_ENV: 'production',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://test:test@localhost/test',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'test-secret-at-least-32-characters',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'localhost',
  MINIO_PORT: process.env.MINIO_PORT || '9000',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'test',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'test-secret',
  MINIO_BUCKET: process.env.MINIO_BUCKET || 'test',
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://imthis.site',
});

const {
  authCookieOptions,
  clearCookieOptions,
  sessionPayload,
} = require('../src/services/sessionService');

const user = {
  id: 'user-1',
  email: 'user@example.com',
  plan: 'Annual',
  userType: 'professional',
};

test('every issued session payload has a unique JWT id', () => {
  const first = sessionPayload(user);
  const second = sessionPayload(user);
  assert.notEqual(first.jti, second.jti);
  assert.equal(first.userId, user.id);
  assert.equal(second.userId, user.id);
});

test('session cookie is host-wide, httpOnly, secure, and same-site lax', () => {
  assert.deepEqual(authCookieOptions(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  assert.deepEqual(clearCookieOptions(), {
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
});
