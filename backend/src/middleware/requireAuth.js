const COOKIE_NAME = 'dropcv_token';
const { isTokenRevoked } = require('../services/authService');
const { pool } = require('../config/db');

async function requireAuth(request, reply) {
  try {
    const token = request.cookies?.[COOKIE_NAME];

    if (!token) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Logout originally only cleared the browser cookie, so replaying the old JWT
    // from a test client still worked. We consult Redis to revoke logged-out tokens.
    if (await isTokenRevoked(token)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const payload = await request.server.jwt.verify(token);

    const { rows } = await pool.query(
      `SELECT id, email, plan, user_type
       FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
      [payload.userId],
    );
    const user = rows[0];
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    request.user = {
      userId: user.id,
      email: user.email,
      plan: user.plan,
      userType: user.user_type,
    };
  } catch (error) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

module.exports = requireAuth;
