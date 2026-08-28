const path = require('path');
const { pool } = require('../config/db');
const { uploadFile } = require('../config/minio');

const CV_EXTENSIONS = new Set(['.pdf', '.docx']);
const CV_MAX_BYTES = 20 * 1024 * 1024;
const SITE_EXTENSIONS = new Set(['.html', '.htm']);
const SITE_MAX_BYTES = 10 * 1024 * 1024;

class UploadError extends Error {
  constructor(message, statusCode = 400, field) {
    super(message);
    this.name = 'UploadError';
    this.statusCode = statusCode;
    this.field = field;
  }
}

function sanitizeFilename(filename) {
  const basename = path.basename(filename || 'upload');
  return basename.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

function getExtension(filename) {
  return path.extname(filename || '').toLowerCase();
}

function getMethodFromExtension(extension) {
  if (extension === '.pdf') return 'pdf';
  if (extension === '.txt') return 'txt';
  return 'docx';
}

async function readMultipartFile(request, fieldName, maxBytes) {
  const file = await request.file({
    limits: {
      fileSize: maxBytes,
      files: 1,
    },
  });

  if (!file) {
    throw new UploadError(`Missing file field "${fieldName}"`, 400, fieldName);
  }

  if (file.fieldname !== fieldName) {
    throw new UploadError(`Expected file field "${fieldName}"`, 400, fieldName);
  }

  const buffer = await file.toBuffer();

  if (buffer.length > maxBytes) {
    throw new UploadError('File is too large', 413, fieldName);
  }

  return {
    buffer,
    originalName: sanitizeFilename(file.filename),
    mimetype: file.mimetype || 'application/octet-stream',
    sizeBytes: buffer.length,
    extension: getExtension(file.filename),
  };
}

function validateExtension(extension, allowedExtensions, field) {
  if (!allowedExtensions.has(extension)) {
    throw new UploadError('Unsupported file type', 400, field);
  }
}

async function createDeployment({
  userId,
  method,
  status = 'processing',
  minioPath = null,
  originalFilename = null,
  fileSizeBytes = null,
  deployedAt = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO deployments (
      user_id, method, status, minio_path, original_filename, file_size_bytes, deployed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, status, method, deployed_at`,
    [userId, method, status, minioPath, originalFilename, fileSizeBytes, deployedAt],
  );

  return rows[0];
}

async function uploadCvFile(request, userId) {
  const file = await readMultipartFile(request, 'cv', CV_MAX_BYTES);
  validateExtension(file.extension, CV_EXTENSIONS, 'cv');

  const objectPath = `cvs/${userId}/${Date.now()}-${file.originalName}`;
  const minioPath = await uploadFile(file.buffer, objectPath, file.mimetype);
  const deployment = await createDeployment({
    userId,
    method: getMethodFromExtension(file.extension),
    minioPath,
    originalFilename: file.originalName,
    fileSizeBytes: file.sizeBytes,
  });

  return {
    deploymentId: deployment.id,
    status: deployment.status,
  };
}

async function uploadSiteHtml(request, userId) {
  // Legacy callers must fail closed; raw HTML is never published on the
  // primary domain.
  throw new UploadError('Raw HTML website uploads are disabled for public safety', 400, 'site');

  /* istanbul ignore next -- retained only for historical compatibility
  const file = await readMultipartFile(request, 'site', SITE_MAX_BYTES);
  validateExtension(file.extension, SITE_EXTENSIONS, 'site');

  const html = file.buffer.toString('utf8');
  if (!html.trim()) {
    throw new UploadError('HTML file is empty', 400, 'site');
  }

  const objectPath = `sites/${userId}/${Date.now()}-${file.originalName}`;
  const minioPath = await uploadFile(file.buffer, objectPath, 'text/html; charset=utf-8');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO deployments (
        user_id, domain_id, method, status, minio_path, original_filename, file_size_bytes, deployed_at
      ) VALUES (
        $1,
        (SELECT id FROM domains WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1),
        'files',
        'live',
        $2,
        $3,
        $4,
        NOW()
      )
      RETURNING id, status, method, deployed_at`,
      [userId, minioPath, file.originalName, file.sizeBytes],
    );

    const deploymentId = rows[0].id;

    await client.query(
      `INSERT INTO parsed_content (
        user_id, deployment_id, source_type, raw_text, structured_json, generated_html, ai_generated
      ) VALUES ($1, $2, 'manual', $3, NULL, $4, false)`,
      [userId, deploymentId, html, html],
    );

    await client.query('UPDATE domains SET is_active = true WHERE user_id = $1', [userId]);
    await client.query('UPDATE professional_profiles SET is_public = true, updated_at = NOW() WHERE user_id = $1', [userId]);

    await client.query('COMMIT');

    return {
      deploymentId,
      status: rows[0].status,
      method: rows[0].method,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  */
}

async function submitStory(userId, body = {}) {
  const q1 = String(body.q1 || '').trim();
  const q2 = String(body.q2 || '').trim();
  const q3 = String(body.q3 || '').trim();
  const q4 = String(body.q4 || '').trim();
  const q5 = String(body.q5 || '').trim();
  const q6 = String(body.q6 || '').trim();

  if (!q1) throw new UploadError('q1 is required', 400, 'q1');
  if (!q2) throw new UploadError('q2 is required', 400, 'q2');
  if (!q3) throw new UploadError('q3 is required', 400, 'q3');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM story_inputs WHERE user_id = $1 LIMIT 1', [userId]);

    if (existing.rowCount > 0) {
      await client.query(
        `UPDATE story_inputs
         SET q1_what_you_do = $2,
          q2_achievements = $3,
          q3_skills = $4,
          q4_differentiator = $5,
          q5_next_career = $6,
          q6_extra = $7,
          updated_at = NOW()
         WHERE id = $1`,
        [existing.rows[0].id, q1, q2, q3, q4 || null, q5 || null, q6 || null],
      );
    } else {
      await client.query(
        `INSERT INTO story_inputs (
          user_id, q1_what_you_do, q2_achievements, q3_skills,
          q4_differentiator, q5_next_career, q6_extra
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, q1, q2, q3, q4 || null, q5 || null, q6 || null],
      );
    }

    const { rows } = await client.query(
      `INSERT INTO deployments (user_id, method, status)
       VALUES ($1, 'story', 'processing')
       RETURNING id, status`,
      [userId],
    );

    await client.query('COMMIT');

    return {
      deploymentId: rows[0].id,
      status: rows[0].status,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getDeploymentStatus(userId, deploymentId) {
  const { rows } = await pool.query(
    `SELECT id, status, method, deployed_at
     FROM deployments
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [deploymentId, userId],
  );

  if (!rows[0]) {
    throw new UploadError('Deployment not found', 404);
  }

  return {
    deploymentId: rows[0].id,
    status: rows[0].status,
    method: rows[0].method,
    deployedAt: rows[0].deployed_at,
  };
}

module.exports = {
  UploadError,
  uploadCvFile,
  uploadSiteHtml,
  submitStory,
  getDeploymentStatus,
};
