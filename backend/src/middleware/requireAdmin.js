const env = require('../config/env');

async function requireAdmin(request, reply) {
  const email = String(request.user?.email || '').trim().toLowerCase();
  if (!email || !env.adminEmails.includes(email)) {
    return reply.code(403).send({ error: 'Administrator access is required' });
  }
}

module.exports = requireAdmin;
