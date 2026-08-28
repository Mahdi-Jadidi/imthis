const path = require('path');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { pool } = require('../config/db');
const { uploadFile, downloadFile, deleteFile } = require('../config/minio');
const { UploadError } = require('../services/uploadService');
const { uploadWebsiteBundle } = require('../services/siteUploadService');
const billingService = require('../services/billingService');
const { sendSiteDeliveryNotice } = require('../services/mailService');

const MAX_RESUME_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 12;
const RESUME_EXTENSIONS = new Set(['.pdf', '.docx']);
const ATTACHMENT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const SITE_TYPES = new Set(['portfolio', 'biography', 'resume', 'mixed']);
const STATUS_UPDATES = new Set(['queued', 'in_progress', 'cancelled']);
const FIELD_LIMITS = Object.freeze({
  siteType: 24, name: 120, role: 120, bio: 1200, goal: 600,
  experience: 2000, projects: 2400, skills: 600, preferredLanguage: 80,
  style: 300, links: 1600, notes: 1500,
});

function safeFilename(filename) {
  return path.basename(filename || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

function clean(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

function sendError(reply, error) {
  if (error instanceof UploadError || typeof error.statusCode === 'number') {
    return reply.code(error.statusCode || 400).send({ error: error.message, field: error.field || undefined });
  }
  reply.log.error(error, 'Manual site request failed');
  return reply.code(500).send({ error: 'Internal server error' });
}

async function readRequestSubmission(request) {
  const brief = {};
  const attachments = [];
  let resume = null;
  let attachmentBytes = 0;

  for await (const part of request.parts({
    limits: { fileSize: MAX_RESUME_BYTES, files: MAX_ATTACHMENTS + 1, parts: 40 },
  })) {
    if (part.type !== 'file') {
      if (Object.prototype.hasOwnProperty.call(FIELD_LIMITS, part.fieldname)) {
        brief[part.fieldname] = clean(part.value, FIELD_LIMITS[part.fieldname]);
      } else if (part.fieldname === 'note') {
        brief.notes = clean(part.value, FIELD_LIMITS.notes);
      }
      continue;
    }

    const extension = path.extname(part.filename || '').toLowerCase();
    const buffer = await part.toBuffer();
    if (!buffer.length) throw new UploadError('Uploaded file is empty', 400, part.fieldname);

    if (part.fieldname === 'resume') {
      if (resume) throw new UploadError('Only one resume may be attached', 400, 'resume');
      if (!RESUME_EXTENSIONS.has(extension)) throw new UploadError('Resume must be a PDF or DOCX file', 400, 'resume');
      resume = { buffer, filename: safeFilename(part.filename), mimetype: part.mimetype || 'application/octet-stream' };
      continue;
    }

    if (part.fieldname !== 'attachments') throw new UploadError('Unexpected file field', 400, part.fieldname);
    if (!ATTACHMENT_EXTENSIONS.has(extension)) {
      throw new UploadError('Portfolio attachments must be JPG, PNG, WebP, or PDF files', 400, 'attachments');
    }
    if (buffer.length > MAX_ATTACHMENT_BYTES) throw new UploadError('Each portfolio attachment must be 10 MB or smaller', 413, 'attachments');
    attachmentBytes += buffer.length;
    if (attachmentBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new UploadError('Portfolio attachments exceed the 50 MB total limit', 413, 'attachments');
    attachments.push({ buffer, filename: safeFilename(part.filename), mimetype: part.mimetype || 'application/octet-stream' });
  }

  brief.siteType = SITE_TYPES.has(brief.siteType) ? brief.siteType : 'mixed';
  if (!brief.name) throw new UploadError('Professional name is required', 400, 'name');
  if (!brief.bio && !brief.goal && !brief.projects && !resume && !attachments.length) {
    throw new UploadError('Tell us about yourself or attach source material', 400, 'bio');
  }
  return { brief, resume, attachments };
}

async function storeSubmissionFiles(userId, requestId, resume, attachments) {
  const uploadedPaths = [];
  try {
    let storedResume = null;
    if (resume) {
      const objectPath = `manual-site-requests/${userId}/${requestId}/resume-${resume.filename}`;
      await uploadFile(resume.buffer, objectPath, resume.mimetype);
      uploadedPaths.push(objectPath);
      storedResume = { path: objectPath, filename: resume.filename, mimetype: resume.mimetype, sizeBytes: resume.buffer.length };
    }
    const storedAttachments = [];
    for (let index = 0; index < attachments.length; index += 1) {
      const item = attachments[index];
      const objectPath = `manual-site-requests/${userId}/${requestId}/asset-${index + 1}-${item.filename}`;
      await uploadFile(item.buffer, objectPath, item.mimetype);
      uploadedPaths.push(objectPath);
      storedAttachments.push({ path: objectPath, filename: item.filename, mimetype: item.mimetype, sizeBytes: item.buffer.length });
    }
    return { storedResume, storedAttachments, uploadedPaths };
  } catch (error) {
    await Promise.all(uploadedPaths.map((objectPath) => deleteFile(objectPath).catch(() => null)));
    throw error;
  }
}

async function sendStoredFile(reply, record) {
  if (!record?.path) return reply.code(404).send({ error: 'Attachment not found' });
  const file = await downloadFile(record.path);
  return reply.type(record.mimetype || 'application/octet-stream')
    .header('Content-Disposition', `attachment; filename="${safeFilename(record.filename)}"`).send(file);
}

async function siteRequestRoutes(fastify) {
  fastify.post('/', { preHandler: requireAuth }, async function submit(request, reply) {
    const uploadedPaths = [];
    try {
      const { brief, resume, attachments } = await readRequestSubmission(request);
      const requestId = require('crypto').randomUUID();
      const stored = await storeSubmissionFiles(request.user.userId, requestId, resume, attachments);
      uploadedPaths.push(...stored.uploadedPaths);
      const { rows } = await pool.query(
        `INSERT INTO manual_site_requests
          (id, user_id, brief, resume_path, resume_filename, resume_mimetype, resume_size_bytes, attachments, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, status, brief, created_at`,
        [requestId, request.user.userId, JSON.stringify(brief), stored.storedResume?.path || null,
          stored.storedResume?.filename || null, stored.storedResume?.mimetype || null,
          stored.storedResume?.sizeBytes || null, JSON.stringify(stored.storedAttachments), brief.notes || null],
      );
      return reply.code(201).send({ request: rows[0] });
    } catch (error) {
      await Promise.all(uploadedPaths.map((objectPath) => deleteFile(objectPath).catch(() => null)));
      return sendError(reply, error);
    }
  });

  fastify.get('/mine', { preHandler: requireAuth }, async function mine(request, reply) {
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.brief, r.created_at, r.updated_at, r.delivered_at,
              r.delivered_deployment_id, s.trial_started_at, s.trial_ends_at, d.full_url
       FROM manual_site_requests r
       LEFT JOIN subscriptions s ON s.user_id = r.user_id
       LEFT JOIN domains d ON d.user_id = r.user_id AND d.is_primary = true
       WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [request.user.userId],
    );
    return reply.send({ requests: rows });
  });

  const adminGuard = { preHandler: [requireAuth, requireAdmin] };
  fastify.get('/admin', adminGuard, async function list(request, reply) {
    const { rows } = await pool.query(
      `SELECT r.id, r.user_id, r.brief, r.resume_filename, r.resume_size_bytes, COALESCE(r.attachments, '[]'::jsonb) AS attachments,
              r.note, r.status, r.created_at, r.updated_at, r.delivered_at,
              r.delivered_deployment_id, r.admin_note, u.email, pp.full_name
       FROM manual_site_requests r JOIN users u ON u.id = r.user_id
       LEFT JOIN professional_profiles pp ON pp.user_id = r.user_id
       ORDER BY r.created_at ASC LIMIT 100`,
    );
    return reply.send({ requests: rows });
  });

  fastify.get('/admin/:id/resume', adminGuard, async function downloadResume(request, reply) {
    const { rows } = await pool.query(
      'SELECT resume_path AS path, resume_filename AS filename, resume_mimetype AS mimetype FROM manual_site_requests WHERE id = $1',
      [request.params.id],
    );
    return sendStoredFile(reply, rows[0]);
  });

  fastify.get('/admin/:id/attachments/:index', adminGuard, async function downloadAttachment(request, reply) {
    const { rows } = await pool.query('SELECT attachments FROM manual_site_requests WHERE id = $1', [request.params.id]);
    const attachments = rows[0]?.attachments || [];
    const index = Number(request.params.index);
    return sendStoredFile(reply, Number.isInteger(index) ? attachments[index] : null);
  });

  fastify.patch('/admin/:id', adminGuard, async function updateStatus(request, reply) {
    const status = String(request.body?.status || '').toLowerCase();
    if (!STATUS_UPDATES.has(status)) return reply.code(400).send({ error: 'Invalid request status' });
    const note = clean(request.body?.note, 1500);
    const { rows } = await pool.query(
      `UPDATE manual_site_requests SET status = $2, admin_note = COALESCE(NULLIF($3, ''), admin_note), updated_at = NOW()
       WHERE id = $1 AND status <> 'delivered' RETURNING id, status, updated_at`,
      [request.params.id, status, note],
    );
    if (!rows[0]) return reply.code(409).send({ error: 'Delivered or unknown request cannot be changed' });
    return reply.send({ request: rows[0] });
  });

  fastify.post('/admin/:id/deliver', adminGuard, async function deliver(request, reply) {
    try {
      const requestResult = await pool.query(
        `SELECT r.user_id, r.status, u.email, d.full_url
         FROM manual_site_requests r JOIN users u ON u.id = r.user_id
         LEFT JOIN domains d ON d.user_id = r.user_id AND d.is_primary = true
         WHERE r.id = $1`, [request.params.id],
      );
      const record = requestResult.rows[0];
      if (!record) return reply.code(404).send({ error: 'Request not found' });
      if (record.status === 'cancelled') return reply.code(409).send({ error: 'Cancelled requests cannot be delivered' });
      if (record.status === 'delivered') return reply.code(409).send({ error: 'Request has already been delivered' });

      const result = await uploadWebsiteBundle(request, record.user_id);
      const client = await pool.connect();
      let subscription;
      try {
        await client.query('BEGIN');
        subscription = await billingService.startTrial(client, record.user_id, result.deploymentId);
        await client.query(
          `UPDATE manual_site_requests SET status = 'delivered', delivered_deployment_id = $2,
           delivered_at = NOW(), completed_at = NOW(), completed_by = $3, updated_at = NOW() WHERE id = $1`,
          [request.params.id, result.deploymentId, request.user.email],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      sendSiteDeliveryNotice({ email: record.email, url: record.full_url,
        trialEndsAt: subscription.trial_ends_at }).catch(() => {});
      return reply.code(201).send({ ...result, requestStatus: 'delivered', trialEndsAt: subscription.trial_ends_at });
    } catch (error) { return sendError(reply, error); }
  });
}

module.exports = siteRequestRoutes;
