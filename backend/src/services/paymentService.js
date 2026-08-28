const { pool } = require('../config/db');
const env = require('../config/env');
const { getPlan } = require('../config/plans');
const billingService = require('./billingService');
const { sendPublicationConfirmation } = require('./mailService');
const {
  MANUAL_PAYMENT_VALIDITY_MS,
  createPaymentCode,
  paymentAmountForCode,
  paymentExpiresAt,
} = require('./manualPaymentCode');

class PaymentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isSubmittedManualPayment(transaction) {
  const response = transaction && transaction.provider_response;
  let details = response || {};
  if (typeof response === 'string') {
    try { details = JSON.parse(response || '{}'); } catch (_) { details = {}; }
  }
  return transaction && (
    transaction.status === 'pending_review' ||
    (transaction.status === 'pending' && details.method === 'card_transfer' && Boolean(details.submitted_at))
  );
}

async function expireManualPaymentRequests() {
  await pool.query(
    `UPDATE payment_transactions
     SET status = 'failed', updated_at = NOW(),
         provider_response = COALESCE(provider_response, '{}'::jsonb) ||
           jsonb_build_object('reason', 'manual_payment_code_expired', 'expired_at', NOW())
     WHERE status = 'pending'
       AND provider_response->>'method' = 'card_transfer'
       AND COALESCE(provider_response->>'submitted_at', '') = ''
       AND created_at < NOW() - INTERVAL '24 hours'`,
  );
}

function apiBase() {
  return env.zarinpal.sandbox ? 'https://sandbox.zarinpal.com/pg/v4/payment' : 'https://payment.zarinpal.com/pg/v4/payment';
}

function startPayBase() {
  return env.zarinpal.sandbox ? 'https://sandbox.zarinpal.com/pg/StartPay/' : 'https://payment.zarinpal.com/pg/StartPay/';
}

async function callZarinpal(path, body) {
  if (!env.zarinpal.merchantId) throw new PaymentError('Payment gateway is not configured', 503);
  const response = await fetch(`${apiBase()}/${path}.json`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new PaymentError('Payment gateway is temporarily unavailable', 502);
  return data;
}

async function createPayment(userId, email, planName) {
  const plan = getPlan(planName);
  if (!plan) throw new PaymentError('Invalid plan');

  const account = await pool.query('SELECT plan FROM users WHERE id = $1 AND is_active = true LIMIT 1', [userId]);
  if (!account.rows[0] || account.rows[0].plan !== planName) {
    throw new PaymentError('Payment plan does not match the account plan', 409);
  }

  await pool.query(
    `UPDATE payment_transactions SET status = 'failed', updated_at = NOW(),
       provider_response = COALESCE(provider_response, '{}'::jsonb) || '{"reason":"expired_pending_request"}'::jsonb
     WHERE user_id = $1 AND status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes'`,
    [userId],
  );
  const pending = await pool.query(
    `SELECT authority FROM payment_transactions
     WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (pending.rows[0]) throw new PaymentError('A payment is already pending for this account', 409);

  let rows;
  try {
    ({ rows } = await pool.query(
      `INSERT INTO payment_transactions (user_id, plan, amount, currency, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [userId, planName, plan.amount, plan.currency],
    ));
  } catch (error) {
    if (error.code === '23505') throw new PaymentError('A payment is already pending for this account', 409);
    throw error;
  }
  const transactionId = rows[0].id;

  try {
    const result = await callZarinpal('request', {
      merchant_id: env.zarinpal.merchantId,
      amount: plan.amount,
      currency: plan.currency,
      description: `I'm This annual subscription`,
      callback_url: `${env.backendUrl}/api/payments/callback`,
      metadata: { email, order_id: transactionId, auto_verify: false },
    });
    if (result?.data?.code !== 100 || !result?.data?.authority) throw new PaymentError('Payment request was rejected', 502);
    const authority = result.data.authority;
    await pool.query(
      `UPDATE payment_transactions SET authority = $2, provider_response = $3, updated_at = NOW() WHERE id = $1`,
      [transactionId, authority, JSON.stringify(result)],
    );
    return { authority, paymentUrl: `${startPayBase()}${authority}`, amount: plan.amount, currency: plan.currency };
  } catch (error) {
    await pool.query(
      `UPDATE payment_transactions SET status = 'failed', provider_response = $2, updated_at = NOW() WHERE id = $1`,
      [transactionId, JSON.stringify({ error: error.message })],
    );
    throw error;
  }
}

async function createManualPayment(userId, email, planName) {
  const plan = getPlan(planName);
  if (!plan) throw new PaymentError('Invalid plan');
  if (!env.manualPayment.cardNumber || !env.manualPayment.cardHolder) {
    throw new PaymentError('Manual payment details are not configured', 503);
  }

  await expireManualPaymentRequests();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT plan FROM users WHERE id = $1 AND is_active = true LIMIT 1', [userId]);
    if (!account.rows[0] || account.rows[0].plan !== planName) {
      throw new PaymentError('Payment plan does not match the account plan', 409);
    }
    let transaction;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const paymentCode = createPaymentCode();
      // The public plan price is 710,000 toman. For card transfers, the amount
      // itself carries the private marker, so it must start from 700,000—not
      // the displayed price—yielding a unique amount between 700100 and 700999.
      const amount = paymentAmountForCode(paymentCode);
      // Serialise the collision check for this exact amount across serverless instances.
      await client.query('SELECT pg_advisory_xact_lock($1)', [amount]);
      const collision = await client.query(
        `SELECT 1 FROM payment_transactions
         WHERE amount = $1 AND status IN ('pending', 'pending_review')
           AND provider_response->>'method' = 'card_transfer'
           AND created_at >= NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [amount],
      );
      if (collision.rows[0]) continue;
      const result = await client.query(
        `INSERT INTO payment_transactions (user_id, plan, amount, currency, status, provider_response)
         VALUES ($1, $2, $3, $4, 'pending', $5)
         RETURNING id, plan, amount, currency, status, created_at`,
        [userId, planName, amount, plan.currency, JSON.stringify({
          method: 'card_transfer',
          requester_email: email,
          payment_code: paymentCode,
        })],
      );
      transaction = result.rows[0];
      break;
    }
    if (!transaction) throw new PaymentError('Could not reserve a unique payment amount. Please try again.', 503);
    await client.query('COMMIT');
    transaction.expiresAt = paymentExpiresAt(transaction.created_at);
    return {
      transaction,
      instructions: {
        cardNumber: env.manualPayment.cardNumber,
        cardHolder: env.manualPayment.cardHolder,
        bankName: env.manualPayment.bankName,
        amount: transaction.amount,
        currency: transaction.currency,
        expiresAt: transaction.expiresAt,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new PaymentError('You already have an open payment request', 409);
    throw error;
  } finally {
    client.release();
  }
}

async function submitManualPayment(userId, transactionId, receiptCode, payerCardLast4) {
  const trackingCode = String(receiptCode || '').trim();
  const cardLast4 = String(payerCardLast4 || '').replace(/\D/g, '');
  if (trackingCode.length > 100) throw new PaymentError('Transfer tracking code is too long');
  if (cardLast4 && cardLast4.length !== 4) throw new PaymentError('Card number must contain its last four digits');

  await expireManualPaymentRequests();

  const result = await pool.query(
    `UPDATE payment_transactions
     SET provider_response = COALESCE(provider_response, '{}'::jsonb) || $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
       AND created_at >= NOW() - INTERVAL '24 hours'
       AND COALESCE(provider_response->>'submitted_at', '') = ''
     RETURNING id, plan, amount, currency, status, created_at, updated_at`,
    [transactionId, userId, JSON.stringify({ receipt_code: trackingCode, payer_card_last4: cardLast4 || null, submitted_at: new Date().toISOString() })],
  );
  if (!result.rows[0]) throw new PaymentError('Payment request was not found, has expired, or has already been submitted', 410);
  // Keep the database status as `pending` for installations whose historic
  // CHECK constraint does not include `pending_review`. The submitted_at marker
  // above is the durable signal used by the admin queue and approval flow.
  return { ...result.rows[0], status: 'pending_review' };
}

async function approveManualPayment(transactionId, adminEmail, reviewNote = '') {
  await expireManualPaymentRequests();
  const client = await pool.connect();
  let transaction;
  let subscription;
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT pt.*, u.email, d.full_url FROM payment_transactions pt
       JOIN users u ON u.id = pt.user_id
       LEFT JOIN domains d ON d.user_id = pt.user_id AND d.is_primary = true
       WHERE pt.id = $1 FOR UPDATE OF pt`, [transactionId],
    );
    transaction = locked.rows[0];
    if (!transaction) throw new PaymentError('Payment request not found', 404);
    if (!isSubmittedManualPayment(transaction)) throw new PaymentError('Only submitted payments can be approved', 409);
    const referenceId = `MAN-${transaction.id.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
    await client.query(
      `UPDATE payment_transactions
       SET status = 'verified', reference_id = $2, verified_at = NOW(), updated_at = NOW(),
           provider_response = COALESCE(provider_response, '{}'::jsonb) ||
             jsonb_build_object('reviewed_at', NOW(), 'reviewed_by', $3::text, 'review_note', $4::text)
       WHERE id = $1`,
      [transaction.id, referenceId, adminEmail, String(reviewNote || '').trim().slice(0, 1000)],
    );
    subscription = await billingService.activateSubscription(client, transaction.user_id, transaction.plan, referenceId, transaction.amount);
    transaction.reference_id = referenceId;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  sendPublicationConfirmation({ email: transaction.email, url: transaction.full_url, plan: transaction.plan,
    expiresAt: subscription?.expires_at, referenceId: transaction.reference_id }).catch(() => {});
  return { transaction, subscription };
}

async function rejectManualPayment(transactionId, adminEmail, reviewNote = '') {
  await expireManualPaymentRequests();
  const note = String(reviewNote || '').trim();
  if (!note) throw new PaymentError('A rejection reason is required');
  const result = await pool.query(
    `UPDATE payment_transactions
     SET status = 'failed', updated_at = NOW(),
         provider_response = COALESCE(provider_response, '{}'::jsonb) ||
           jsonb_build_object('rejected_at', NOW(), 'rejected_by', $2::text, 'rejection_reason', $3::text)
     WHERE id = $1
       AND (status = 'pending_review' OR (status = 'pending' AND provider_response->>'method' = 'card_transfer'
         AND COALESCE(provider_response->>'submitted_at', '') <> ''))
     RETURNING id, status`, [transactionId, adminEmail, note.slice(0, 1000)],
  );
  if (!result.rows[0]) throw new PaymentError('Only submitted payments can be rejected', 409);
  return result.rows[0];
}

async function cancelPayment(authority) {
  await pool.query(
    `UPDATE payment_transactions SET status = 'cancelled', updated_at = NOW()
     WHERE authority = $1 AND status = 'pending'`,
    [authority],
  );
}

async function verifyPayment(authority) {
  const existing = await pool.query(
    `SELECT pt.*, u.email, d.full_url
     FROM payment_transactions pt JOIN users u ON u.id = pt.user_id
     LEFT JOIN domains d ON d.user_id = pt.user_id AND d.is_primary = true
     WHERE pt.authority = $1 LIMIT 1`,
    [authority],
  );
  const transaction = existing.rows[0];
  if (!transaction) throw new PaymentError('Unknown payment authority', 404);
  if (transaction.status === 'verified') return { transaction, alreadyVerified: true };
  if (transaction.status !== 'pending') throw new PaymentError('Payment is not pending', 409);

  const result = await callZarinpal('verify', {
    merchant_id: env.zarinpal.merchantId,
    amount: transaction.amount,
    authority,
  });
  const code = Number(result?.data?.code);
  if (![100, 101].includes(code) || !result?.data?.ref_id) {
    await pool.query(
      `UPDATE payment_transactions SET status = 'failed', provider_response = $2, updated_at = NOW() WHERE id = $1`,
      [transaction.id, JSON.stringify(result)],
    );
    throw new PaymentError('Payment could not be verified', 402);
  }

  const client = await pool.connect();
  let subscription;
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM payment_transactions WHERE id = $1 FOR UPDATE', [transaction.id]);
    if (locked.rows[0].status === 'verified') {
      await client.query('COMMIT');
      return { transaction: locked.rows[0], alreadyVerified: true };
    }
    const referenceId = String(result.data.ref_id);
    await client.query(
      `UPDATE payment_transactions SET status = 'verified', reference_id = $2, provider_response = $3,
       verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [transaction.id, referenceId, JSON.stringify(result)],
    );
    subscription = await billingService.activateSubscription(client, transaction.user_id, transaction.plan, referenceId, transaction.amount);
    await client.query('COMMIT');
    transaction.reference_id = referenceId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  sendPublicationConfirmation({
    email: transaction.email,
    url: transaction.full_url,
    plan: transaction.plan,
    expiresAt: subscription?.expires_at,
    referenceId: transaction.reference_id,
  }).catch((error) => console.error('[mail] publication confirmation failed', error));

  return { transaction, subscription, alreadyVerified: false };
}

module.exports = {
  PaymentError,
  isSubmittedManualPayment,
  MANUAL_PAYMENT_VALIDITY_MS,
  expireManualPaymentRequests,
  createPayment,
  createManualPayment,
  submitManualPayment,
  approveManualPayment,
  rejectManualPayment,
  verifyPayment,
  cancelPayment,
};
