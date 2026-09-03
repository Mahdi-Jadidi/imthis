const {
  AuthError,
  registerUser,
  loginUser,
  checkSlugAvailability,
  getUserById,
  isTokenRevoked,
  getUserByEmail,
  verifyEmail,
  assertValidPassword,
  resetPassword,
} = require('../services/authService');
const {
  COOKIE_NAME,
  clearSession,
  replaceSession,
  revokeSessionBestEffort,
} = require('../services/sessionService');
const requireAuth = require('../middleware/requireAuth');
const rateLimiter = require('../middleware/rateLimiter');
const env = require('../config/env');
const { issueCode, verifyCode, normalizeEmail } = require('../services/authCodeService');
const { sendVerificationCode, sendPasswordResetCode } = require('../services/mailService');

function sendError(reply, error) {
  if (error instanceof AuthError) {
    const body = { error: error.message };

    if (error.field) {
      body.field = error.field;
    }

    return reply.code(error.statusCode).send(body);
  }

  if (error.statusCode) {
    return reply.code(error.statusCode).send({ error: error.message });
  }

  console.error('Auth route error', error);
  return reply.code(500).send({ error: 'Internal server error' });
}

async function authRoutes(fastify) {
  fastify.get('/slug-availability', {
    preHandler: rateLimiter({ name: 'slug-availability', windowSeconds: 60, maxRequests: 30 }),
  }, async function slugAvailabilityHandler(request, reply) {
    try {
      const result = await checkSlugAvailability(request.query?.slug);
      return reply.send({ success: true, ...result });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/register', {
    preHandler: rateLimiter({ name: 'auth-register', windowSeconds: 60 * 60, maxRequests: 5 }),
  }, async function registerHandler(request, reply) {
    try {
      const user = await registerUser(request.body || {});
      const code = await issueCode('verify-email', user.email);
      await sendVerificationCode({ email: user.email, code });

      return reply.code(201).send({
        success: true,
        requiresEmailVerification: true,
        user,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/verify-email', {
    preHandler: rateLimiter({ name: 'auth-verify-email', windowSeconds: 15 * 60, maxRequests: 10 }),
  }, async function verifyEmailHandler(request, reply) {
    const email = normalizeEmail(request.body?.email);
    if (!(await verifyCode('verify-email', email, request.body?.code))) {
      return reply.code(400).send({ error: 'Invalid or expired verification code', field: 'code' });
    }
    const user = await verifyEmail(email);
    if (!user) return reply.code(404).send({ error: 'Account not found' });
    await replaceSession(fastify, request, reply, user);
    return reply.send({ success: true, user });
  });

  fastify.post('/verify-email/resend', {
    preHandler: rateLimiter({ name: 'auth-verify-resend', windowSeconds: 60 * 60, maxRequests: 10 }),
  }, async function resendVerificationHandler(request, reply) {
    try {
      const email = normalizeEmail(request.body?.email);
      const user = await getUserByEmail(email);
      if (user && !user.email_verified) {
        const code = await issueCode('verify-email', email, { force: request.body?.force === true });
        await sendVerificationCode({ email, code });
      }
      return reply.send({ success: true, message: 'If the account needs verification, a code has been sent.', to: email, from: env.smtp.from });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/password-reset/request', {
    preHandler: rateLimiter({ name: 'auth-password-reset-request', windowSeconds: 60 * 60, maxRequests: 10 }),
  }, async function requestPasswordResetHandler(request, reply) {
    try {
      const email = normalizeEmail(request.body?.email);
      const user = await getUserByEmail(email);
      if (user) {
        const code = await issueCode('reset-password', email);
        await sendPasswordResetCode({ email, code });
      }
      return reply.send({ success: true, message: 'If the account exists, a reset code has been sent.' });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/password-reset/confirm', {
    preHandler: rateLimiter({ name: 'auth-password-reset-confirm', windowSeconds: 15 * 60, maxRequests: 10 }),
  }, async function confirmPasswordResetHandler(request, reply) {
    try {
      const email = normalizeEmail(request.body?.email);
      // Validate before consuming the one-time code, so a weak password does
      // not force the user to request a replacement email.
      assertValidPassword(request.body?.password);
      if (!(await verifyCode('reset-password', email, request.body?.code))) {
        return reply.code(400).send({ error: 'Invalid or expired reset code', field: 'code' });
      }
      if (!(await resetPassword(email, request.body?.password))) {
        return reply.code(400).send({ error: 'Invalid or expired reset code', field: 'code' });
      }
      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/login', {
    preHandler: rateLimiter({ name: 'auth-login', windowSeconds: 5 * 60, maxRequests: 10 }),
  }, async function loginHandler(request, reply) {
    try {
      const user = await loginUser(request.body || {});
      await replaceSession(fastify, request, reply, user);

      return reply.send({
        success: true,
        user,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/logout', {
    preHandler: rateLimiter({ name: 'auth-logout', windowSeconds: 60, maxRequests: 30 }),
  }, async function logoutHandler(request, reply) {
    const token = request.cookies?.[COOKIE_NAME];
    // Clearing the browser cookie is unconditional; Redis availability must
    // never prevent a user from signing out on this device.
    clearSession(reply);
    await revokeSessionBestEffort(fastify, token, request.log);
    return reply.send({ success: true });
  });

  fastify.get('/me', { preHandler: requireAuth }, async function meHandler(request, reply) {
    try {
      const user = await getUserById(request.user.userId);

      return reply.send({
        success: true,
        user,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/refresh', async function refreshHandler(request, reply) {
    try {
      const token = request.cookies?.[COOKIE_NAME];

      if (!token) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      if (await isTokenRevoked(token)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const decoded = await fastify.jwt.verify(token);
      const user = await getUserById(decoded.userId);
      await replaceSession(fastify, request, reply, user);

      return reply.send({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          plan: user.plan,
          userType: user.userType,
          slug: user.slug,
          publicUrl: user.publicUrl || null,
          firstName: user.firstName,
        },
      });
    } catch (error) {
      if (error.code === 'FAST_JWT_EXPIRED' || error.name === 'TokenExpiredError') {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      if (error.code?.startsWith?.('FAST_JWT')) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      return sendError(reply, error);
    }
  });
}

module.exports = authRoutes;
