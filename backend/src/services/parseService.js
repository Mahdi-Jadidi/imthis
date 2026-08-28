const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { pool } = require('../config/db');
const { downloadFile } = require('../config/minio');
const env = require('../config/env');
const billingService = require('./billingService');
const { connectRedis } = require('../config/redis');
const { randomUUID } = require('node:crypto');

const anthropic = new Anthropic({
  apiKey: env.anthropicApiKey,
});

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function extractJson(text) {
  const raw = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '');

  try {
    return JSON.parse(raw);
  } catch (error) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');

    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }

    throw error;
  }
}

function buildPartialCv(rawText) {
  const text = String(rawText || '');
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0] || '';
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
  const explicitSkillsLine = text.match(/skills?\s*:\s*([^\n\r]+)/i)?.[1] || '';
  const inferredSkills = explicitSkillsLine
    .split(/[,|]/)
    .map((skill) => skill.trim())
    .filter(Boolean);

  return {
    fullName: firstLine || 'Professional',
    headline: '',
    email,
    phone,
    city: '',
    country: '',
    summary: text.slice(0, 500),
    experience: [],
    education: [],
    // The initial fallback returned an empty skills array for simple PDFs,
    // which made parsed CV records look incomplete even when the text had a
    // clear "Skills:" line. We now recover those obvious values heuristically.
    skills: inferredSkills,
    languages: [],
    achievements: [],
    links: {
      linkedin: '',
      github: '',
      website: '',
    },
  };
}

function getClaudeText(response) {
  return response.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function extractPdfTextFallback(buffer) {
  const text = buffer.toString('latin1');
  const matches = [...text.matchAll(/\(([^()]*)\)\s*Tj/g)];

  if (matches.length > 0) {
    return matches.map((match) => match[1]).join('\n');
  }

  return text.replace(/[^\x20-\x7E\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function structureWithClaude(rawText) {
  const systemPrompt = `You are a CV parser. Extract information from the following CV text and return ONLY a JSON object with these exact fields:
{
  fullName: string,
  headline: string,
  email: string,
  phone: string,
  city: string,
  country: string,
  summary: string,
  experience: [{ role, company, startYear, endYear, description }],
  education: [{ degree, institution, year }],
  skills: [string],
  languages: [string],
  achievements: [string],
  links: { linkedin, github, website }
}
Return ONLY valid JSON. No explanation. No markdown.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: rawText,
        },
      ],
    });

    return extractJson(getClaudeText(response));
  } catch (error) {
    return buildPartialCv(rawText);
  }
}

function renderList(items, renderItem) {
  const safeItems = normalizeArray(items);

  if (safeItems.length === 0) {
    return '';
  }

  return safeItems.map(renderItem).join('');
}

function generateHTML(structuredJson = {}) {
  const skills = normalizeArray(structuredJson.skills);
  const languages = normalizeArray(structuredJson.languages);
  const achievements = normalizeArray(structuredJson.achievements);
  const experience = normalizeArray(structuredJson.experience);
  const education = normalizeArray(structuredJson.education);
  const links = structuredJson.links || {};

  const resumeText = JSON.stringify(structuredJson);
  const isPersian = /[\u0600-\u06ff]/.test(resumeText);
  const language = isPersian ? 'fa' : 'en';
  const direction = isPersian ? 'rtl' : 'ltr';
  const labels = isPersian
    ? { summary: 'درباره من', experience: 'تجربه کاری', skills: 'مهارت‌ها', education: 'تحصیلات', achievements: 'دستاوردها', languages: 'زبان‌ها' }
    : { summary: 'Summary', experience: 'Experience', skills: 'Skills', education: 'Education', achievements: 'Achievements', languages: 'Languages' };

  return `<!doctype html>
<html lang="${language}" dir="${direction}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(structuredJson.fullName || 'Professional CV')}</title>
  <style>
    body { margin: 0; background: #ffffff; color: #1f2933; font-family: Inter, Arial, sans-serif; line-height: 1.6; }
    main { max-width: 920px; margin: 0 auto; padding: 56px 28px; }
    header { border-bottom: 3px solid #0F6E56; padding-bottom: 24px; margin-bottom: 32px; }
    h1 { font-size: 44px; line-height: 1.1; margin: 0 0 8px; color: #0F6E56; }
    h2 { font-size: 20px; color: #0F6E56; margin: 32px 0 12px; }
    h3 { margin: 0; font-size: 18px; }
    p { margin: 0 0 12px; }
    .headline { font-size: 20px; color: #52616b; margin: 0 0 16px; }
    .contact { display: flex; flex-wrap: wrap; gap: 10px 18px; color: #52616b; font-size: 14px; }
    .timeline-item { border-inline-start: 2px solid #d9e7e2; padding-inline-start: 16px; margin-bottom: 18px; }
    .meta { color: #66788a; font-size: 14px; margin-bottom: 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { border: 1px solid #b9d8cf; color: #0F6E56; border-radius: 999px; padding: 5px 10px; font-size: 14px; }
    ul { margin: 0; padding-inline-start: 20px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(structuredJson.fullName || 'Professional')}</h1>
      <p class="headline">${escapeHtml(structuredJson.headline || '')}</p>
      <div class="contact">
        ${structuredJson.email ? `<span>${escapeHtml(structuredJson.email)}</span>` : ''}
        ${structuredJson.phone ? `<span>${escapeHtml(structuredJson.phone)}</span>` : ''}
        ${structuredJson.city || structuredJson.country ? `<span>${escapeHtml([structuredJson.city, structuredJson.country].filter(Boolean).join(', '))}</span>` : ''}
        ${links.linkedin ? `<span>${escapeHtml(links.linkedin)}</span>` : ''}
        ${links.github ? `<span>${escapeHtml(links.github)}</span>` : ''}
        ${links.website ? `<span>${escapeHtml(links.website)}</span>` : ''}
      </div>
    </header>

    ${structuredJson.summary ? `<section><h2>${labels.summary}</h2><p>${escapeHtml(structuredJson.summary)}</p></section>` : ''}

    ${experience.length ? `<section><h2>${labels.experience}</h2>${renderList(experience, (item) => `
      <article class="timeline-item">
        <h3>${escapeHtml(item.role || '')}${item.company ? `, ${escapeHtml(item.company)}` : ''}</h3>
        <div class="meta">${escapeHtml([item.startYear, item.endYear].filter(Boolean).join(' - '))}</div>
        ${
          Array.isArray(item.description)
            ? `<ul>${item.description.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
            : `<p>${escapeHtml(item.description || '')}</p>`
        }
      </article>`)}</section>` : ''}

    ${skills.length ? `<section><h2>${labels.skills}</h2><div class="chips">${skills.map((skill) => `<span class="chip">${escapeHtml(skill)}</span>`).join('')}</div></section>` : ''}

    ${education.length ? `<section><h2>${labels.education}</h2>${renderList(education, (item) => `
      <article class="timeline-item">
        <h3>${escapeHtml(item.degree || '')}</h3>
        <div class="meta">${escapeHtml([item.institution, item.year].filter(Boolean).join(' | '))}</div>
      </article>`)}</section>` : ''}

    ${achievements.length ? `<section><h2>${labels.achievements}</h2><ul>${achievements.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : ''}

    ${languages.length ? `<section><h2>${labels.languages}</h2><div class="chips">${languages.map((language) => `<span class="chip">${escapeHtml(language)}</span>`).join('')}</div></section>` : ''}
  </main>
</body>
</html>`;
}

async function extractRawText(method, buffer, originalFilename) {
  if (method === 'pdf') {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      // pdf-parse can reject tiny synthetic PDFs with malformed xref tables.
      // We still salvage visible text so the deployment can complete instead
      // of flipping to failed for otherwise readable content.
      return extractPdfTextFallback(buffer);
    }
  }

  if (method === 'docx') {
    if (originalFilename && originalFilename.toLowerCase().endsWith('.doc')) {
      throw new Error('Legacy .doc files are not supported for parsing. Please upload .docx, .pdf, or .txt.');
    }

    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (method === 'txt') {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported parsing method: ${method}`);
}

async function parseFile(deploymentId, userId) {
  const existing = await pool.query(
    `SELECT structured_json FROM parsed_content
     WHERE deployment_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [deploymentId, userId],
  );
  if (existing.rows[0]) {
    return { deploymentId, status: 'live', structuredJson: existing.rows[0].structured_json, cached: true };
  }

  const redis = await connectRedis();
  const lockKey = `parse-lock:${deploymentId}`;
  const lockToken = randomUUID();
  const acquired = await redis.set(lockKey, lockToken, { NX: true, EX: 300 });
  if (!acquired) {
    const error = new Error('This deployment is already being parsed');
    error.statusCode = 409;
    throw error;
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, method, minio_path, original_filename
       FROM deployments
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [deploymentId, userId],
    );
    const deployment = rows[0];

    if (!deployment) {
      throw new Error('Deployment not found');
    }

    if (!deployment.minio_path) {
      throw new Error('Deployment does not have an uploaded file');
    }

    const buffer = await downloadFile(deployment.minio_path);
    const rawText = await extractRawText(deployment.method, buffer, deployment.original_filename);
    const structuredJson = await structureWithClaude(rawText);
    const generatedHtml = generateHTML(structuredJson);

    await pool.query(
      `INSERT INTO parsed_content (
        user_id, deployment_id, source_type, raw_text, structured_json,
        generated_html, ai_generated
      ) VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [userId, deploymentId, deployment.method, rawText, JSON.stringify(structuredJson), generatedHtml],
    );

    await pool.query(
      `UPDATE deployments
       SET status = 'draft', deployed_at = NULL, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [deploymentId, userId],
    );

    const published = await billingService.publishSite(userId, deploymentId);

    return {
      deploymentId,
      status: published ? 'live' : 'draft',
      structuredJson,
      cached: false,
    };
  } catch (error) {
    await pool.query(
      `UPDATE deployments
       SET status = 'failed', updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [deploymentId, userId],
    );

    throw error;
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [lockKey], arguments: [lockToken] },
    ).catch((error) => console.error('Parse lock release failed', error));
  }
}

async function getParsedContent(deploymentId, userId) {
  const { rows } = await pool.query(
    `SELECT pc.id, pc.deployment_id, pc.source_type, pc.structured_json,
      pc.generated_html, pc.created_at
     FROM parsed_content pc
     INNER JOIN deployments d ON d.id = pc.deployment_id
     WHERE pc.deployment_id = $1 AND pc.user_id = $2 AND d.user_id = $2
     ORDER BY pc.created_at DESC
     LIMIT 1`,
    [deploymentId, userId],
  );

  if (!rows[0]) {
    throw new Error('Parsed content not found');
  }

  return rows[0];
}

module.exports = {
  parseFile,
  structureWithClaude,
  generateHTML,
  getParsedContent,
};
