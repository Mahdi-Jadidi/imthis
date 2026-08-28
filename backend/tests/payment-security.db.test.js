const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const env = require('../src/config/env');
const { pool } = require('../src/config/db');
const trustedOrigin = require('../src/middleware/trustedOrigin');
const { registerUser } = require('../src/services/authService');
const { createPayment, verifyPayment } = require('../src/services/paymentService');

const originalFetch = global.fetch;
const createdUsers = [];
const originalGateway = { ...env.zarinpal };

function uniqueId() {
  return crypto.randomUUID().slice(0, 8);
}

function fakeResponse(data, ok = true) {
  return {
    ok,
    json: async () => data,
  };
}

function makeReply() {
  return {
    statusCode: 200,
    body: null,
    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function withMockFetch(handlers, fn) {
  let calls = 0;
  global.fetch = async (...args) => {
    const handler = handlers[calls++];
    if (!handler) {
      throw new Error(`Unexpected fetch call #${calls} to ${args[0]}`);
    }
    return handler(...args);
  };

  try {
    return await fn(() => calls);
  } finally {
    global.fetch = originalFetch;
  }
}

async function registerDraft(plan, suffix = uniqueId()) {
  const email = `${plan.toLowerCase()}-${suffix}@test.drop.cv`;
  const slug = `${plan.toLowerCase()}-${suffix}`;
  const user = await registerUser({
    email,
    password: 'Password123!',
    plan,
    userType: 'professional',
    slug,
    professionalProfile: {
      fullName: `${plan} Tester ${suffix}`,
      isPublic: false,
    },
  });

  createdUsers.push(email);

  const { rows } = await pool.query(
    `INSERT INTO deployments (user_id, method, status, original_filename)
     VALUES ($1, 'docx', 'draft', $2)
     RETURNING id`,
    [user.id, `${slug}.docx`],
  );

  return {
    email,
    slug,
    userId: user.id,
    deploymentId: rows[0].id,
  };
}

async function cleanupCreatedUsers() {
  for (const email of createdUsers.splice(0)) {
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
  }
}

test.before(async () => {
  env.zarinpal.merchantId = 'test-merchant-id';
  env.zarinpal.sandbox = true;
});

test.after(async () => {
  await cleanupCreatedUsers();
  env.zarinpal.merchantId = originalGateway.merchantId;
  env.zarinpal.sandbox = originalGateway.sandbox;
});

test('trusted origin blocks browser mutations from untrusted origins', { concurrency: false }, async () => {
  const reply = makeReply();
  await trustedOrigin(
    {
      method: 'POST',
      headers: { origin: 'http://evil.example' },
      cookies: { dropcv_token: 'signed-cookie' },
    },
    reply,
  );

  assert.equal(reply.statusCode, 403);
  assert.deepEqual(reply.body, { error: 'Untrusted request origin' });
});

test('payment request is server-priced and duplicate requests stay blocked until the transaction resolves', { concurrency: false }, async () => {
  const user = await registerDraft('Standard');

  await withMockFetch([
    async (url, options) => {
      assert.match(String(url), /\/request\.json$/);
      const payload = JSON.parse(options.body);
      assert.equal(payload.merchant_id, 'test-merchant-id');
      assert.equal(payload.amount, 690000);
      assert.equal(payload.currency, 'IRT');
      assert.equal(payload.metadata.email, user.email);
      return fakeResponse({ data: { code: 100, authority: 'AUTH-REQ-1' } });
    },
  ], async (calls) => {
    const result = await createPayment(user.userId, user.email, 'Standard');

    assert.equal(result.authority, 'AUTH-REQ-1');
    assert.equal(result.amount, 690000);
    assert.equal(result.currency, 'IRT');
    assert.match(result.paymentUrl, /StartPay\/AUTH-REQ-1$/);

    const transaction = await pool.query(
      `SELECT plan, amount, currency, status, authority
       FROM payment_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.userId],
    );

    assert.equal(transaction.rows[0].plan, 'Standard');
    assert.equal(transaction.rows[0].amount, 690000);
    assert.equal(transaction.rows[0].currency, 'IRT');
    assert.equal(transaction.rows[0].status, 'pending');
    assert.equal(transaction.rows[0].authority, 'AUTH-REQ-1');

    await assert.rejects(
      createPayment(user.userId, user.email, 'Standard'),
      /already pending/,
    );
    assert.equal(calls(), 1);
  });
});

test('verified callbacks activate once, publish once, and ignore duplicates', { concurrency: false }, async () => {
  const user = await registerDraft('Premium');

  await withMockFetch([
    async (url, options) => {
      assert.match(String(url), /\/request\.json$/);
      const payload = JSON.parse(options.body);
      assert.equal(payload.amount, 990000);
      assert.equal(payload.currency, 'IRT');
      return fakeResponse({ data: { code: 100, authority: 'AUTH-OK-1' } });
    },
    async (url, options) => {
      assert.match(String(url), /\/verify\.json$/);
      const payload = JSON.parse(options.body);
      assert.equal(payload.amount, 990000);
      assert.equal(payload.authority, 'AUTH-OK-1');
      return fakeResponse({ data: { code: 101, ref_id: 'REF-101' } });
    },
  ], async (calls) => {
    const requestResult = await createPayment(user.userId, user.email, 'Premium');
    assert.equal(requestResult.authority, 'AUTH-OK-1');

    const verified = await verifyPayment('AUTH-OK-1');
    assert.equal(verified.alreadyVerified, false);
    assert.equal(verified.transaction.reference_id, 'REF-101');
    assert.equal(verified.subscription.plan, 'Premium');
    assert.equal(verified.subscription.status, 'active');
    assert.equal(verified.subscription.site_status, 'active');
    assert.equal(verified.subscription.is_paid, true);
    assert.equal(verified.subscription.currency, 'IRT');

    const afterSuccess = await pool.query(
      `SELECT pt.status AS payment_status, pt.reference_id, s.status AS subscription_status,
              s.site_status, s.is_paid, s.expires_at, d.is_active, dep.status AS deployment_status
       FROM payment_transactions pt
       JOIN subscriptions s ON s.user_id = pt.user_id
       JOIN domains d ON d.user_id = pt.user_id AND d.is_primary = true
       JOIN deployments dep ON dep.user_id = pt.user_id
       WHERE pt.user_id = $1
       ORDER BY pt.created_at DESC
       LIMIT 1`,
      [user.userId],
    );

    assert.equal(afterSuccess.rows[0].payment_status, 'verified');
    assert.equal(afterSuccess.rows[0].reference_id, 'REF-101');
    assert.equal(afterSuccess.rows[0].subscription_status, 'active');
    assert.equal(afterSuccess.rows[0].site_status, 'active');
    assert.equal(afterSuccess.rows[0].is_paid, true);
    assert.equal(afterSuccess.rows[0].is_active, true);
    assert.equal(afterSuccess.rows[0].deployment_status, 'live');

    const expiresAt = afterSuccess.rows[0].expires_at;

    const duplicate = await verifyPayment('AUTH-OK-1');
    assert.equal(duplicate.alreadyVerified, true);
    assert.equal(calls(), 2);

    const duplicateState = await pool.query(
      `SELECT s.expires_at, pt.status AS payment_status, pt.reference_id
       FROM payment_transactions pt
       JOIN subscriptions s ON s.user_id = pt.user_id
       WHERE pt.user_id = $1
       ORDER BY pt.created_at DESC
       LIMIT 1`,
      [user.userId],
    );

    assert.equal(duplicateState.rows[0].payment_status, 'verified');
    assert.equal(duplicateState.rows[0].reference_id, 'REF-101');
    assert.equal(String(duplicateState.rows[0].expires_at), String(expiresAt));
  });
});

test('failed verification keeps the trial private and marks the transaction failed', { concurrency: false }, async () => {
  const user = await registerDraft('Standard');

  await withMockFetch([
    async () => fakeResponse({ data: { code: 100, authority: 'AUTH-FAIL-1' } }),
    async (url, options) => {
      assert.match(String(url), /\/verify\.json$/);
      const payload = JSON.parse(options.body);
      assert.equal(payload.amount, 690000);
      return fakeResponse({ data: { code: 102 } });
    },
  ], async () => {
    const requestResult = await createPayment(user.userId, user.email, 'Standard');
    assert.equal(requestResult.authority, 'AUTH-FAIL-1');

    await assert.rejects(verifyPayment('AUTH-FAIL-1'), /Payment could not be verified/);

    const state = await pool.query(
      `SELECT pt.status AS payment_status, s.status AS subscription_status, s.site_status, s.is_paid, d.is_active
       FROM payment_transactions pt
       JOIN subscriptions s ON s.user_id = pt.user_id
       JOIN domains d ON d.user_id = pt.user_id AND d.is_primary = true
       WHERE pt.user_id = $1
       ORDER BY pt.created_at DESC
       LIMIT 1`,
      [user.userId],
    );

    assert.equal(state.rows[0].payment_status, 'failed');
    assert.equal(state.rows[0].subscription_status, 'trial');
    assert.equal(state.rows[0].site_status, 'trial');
    assert.equal(state.rows[0].is_paid, false);
    assert.equal(state.rows[0].is_active, false);
  });
});
