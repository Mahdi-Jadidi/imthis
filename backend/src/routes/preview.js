const requireAuth = require('../middleware/requireAuth');
const { pool } = require('../config/db');
const { generateHTML } = require('../services/parseService');

function cleanText(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function cleanArray(value, maxItems = 50) {
  return Array.isArray(value) ? value.slice(0, maxItems) : [];
}

function sanitizeResume(input = {}) {
  return {
    fullName: cleanText(input.fullName, 255),
    headline: cleanText(input.headline, 500),
    email: cleanText(input.email, 255),
    phone: cleanText(input.phone, 50),
    city: cleanText(input.city, 100),
    country: cleanText(input.country, 100),
    summary: cleanText(input.summary),
    skills: cleanArray(input.skills).map((item) => cleanText(item, 100)).filter(Boolean),
    languages: cleanArray(input.languages).map((item) => cleanText(item, 100)).filter(Boolean),
    achievements: cleanArray(input.achievements).map((item) => cleanText(item, 500)).filter(Boolean),
    experience: cleanArray(input.experience, 30).map((item) => ({
      role: cleanText(item?.role, 255), company: cleanText(item?.company, 255),
      startYear: cleanText(item?.startYear, 20), endYear: cleanText(item?.endYear, 20),
      description: Array.isArray(item?.description)
        ? cleanArray(item.description, 20).map((point) => cleanText(point, 1000))
        : cleanText(item?.description, 3000),
    })),
    education: cleanArray(input.education, 30).map((item) => ({
      degree: cleanText(item?.degree, 255), institution: cleanText(item?.institution || item?.school, 255), year: cleanText(item?.year || item?.years, 30),
    })),
    links: {
      linkedin: cleanText(input.links?.linkedin, 500), github: cleanText(input.links?.github, 500), website: cleanText(input.links?.website, 500),
    },
  };
}

async function previewRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/:deploymentId', async function getPreview(request, reply) {
    const { rows } = await pool.query(
      `SELECT d.id, d.status, pc.structured_json, pc.generated_html, pc.created_at
       FROM deployments d JOIN parsed_content pc ON pc.deployment_id = d.id
       WHERE d.id = $1 AND d.user_id = $2 ORDER BY pc.created_at DESC LIMIT 1`,
      [request.params.deploymentId, request.user.userId],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Preview not found' });
    return reply.send({ preview: rows[0] });
  });

  fastify.patch('/:deploymentId', async function updatePreview(request, reply) {
    const resume = sanitizeResume(request.body || {});
    if (!resume.fullName) return reply.code(400).send({ error: 'Full name is required' });
    const html = generateHTML(resume);
    const { rows } = await pool.query(
      `UPDATE parsed_content pc SET structured_json = $3, generated_html = $4
       FROM deployments d WHERE pc.deployment_id = d.id AND d.id = $1 AND d.user_id = $2
       RETURNING pc.deployment_id`,
      [request.params.deploymentId, request.user.userId, JSON.stringify(resume), html],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Preview not found' });
    return reply.send({ success: true, deploymentId: rows[0].deployment_id, preview: resume, generatedHtml: html });
  });
}

module.exports = previewRoutes;
