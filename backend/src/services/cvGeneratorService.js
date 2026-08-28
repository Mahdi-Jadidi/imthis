const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../config/db');
const env = require('../config/env');
const { generateHTML } = require('./parseService');
const billingService = require('./billingService');

const anthropic = new Anthropic({
  apiKey: env.anthropicApiKey,
});

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

function getClaudeText(response) {
  return response.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function buildFallbackCv(story) {
  const skills = String(story.q3_skills || '')
    .split(/[,;\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean);

  return {
    fullName: 'Professional',
    headline: String(story.q1_what_you_do || '').slice(0, 120),
    summary: [story.q1_what_you_do, story.q4_differentiator, story.q5_next_career].filter(Boolean).join(' '),
    experience: [
      {
        role: 'Professional',
        company: '',
        startYear: '',
        endYear: '',
        description: [story.q2_achievements, story.q6_extra].filter(Boolean),
      },
    ],
    education: [],
    skills,
    achievements: String(story.q2_achievements || '')
      .split(/\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    languages: [],
    suggestedJobTitles: [],
  };
}

async function generateStructuredCv(story) {
  const systemPrompt = 'You are a professional CV writer with 20 years of experience.\nYou write compelling, honest, and professional CVs.\nReturn ONLY a JSON object - no markdown, no explanation.';
  const userMessage = `Write a complete professional CV for this person based on what they've told us about themselves:

What they do: ${story.q1_what_you_do || ''}
Top achievements: ${story.q2_achievements || ''}
Skills and tools: ${story.q3_skills || ''}
What makes them different: ${story.q4_differentiator || ''}
Career goals: ${story.q5_next_career || ''}
Additional info: ${story.q6_extra || ''}

Return this exact JSON structure:
{
  fullName: string (use 'Professional' if name unknown),
  headline: string (compelling one-liner),
  summary: string (3-4 sentences, professional tone),
  experience: [{ role, company, startYear, endYear, description (2-3 bullet points as array) }],
  education: [],
  skills: [string] (extract all mentioned skills),
  achievements: [string] (as bullet points),
  languages: [],
  suggestedJobTitles: [string]
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    return extractJson(getClaudeText(response));
  } catch (error) {
    return buildFallbackCv(story);
  }
}

async function generateFromStory(deploymentId, userId) {
  try {
    const { rows } = await pool.query(
      `SELECT *
       FROM story_inputs
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId],
    );
    const story = rows[0];

    if (!story) {
      throw new Error('Story input not found');
    }

    const structuredJson = await generateStructuredCv(story);
    const generatedHtml = generateHTML(structuredJson);
    const rawText = [
      story.q1_what_you_do,
      story.q2_achievements,
      story.q3_skills,
      story.q4_differentiator,
      story.q5_next_career,
      story.q6_extra,
    ]
      .filter(Boolean)
      .join('\n\n');

    await pool.query(
      `INSERT INTO parsed_content (
        user_id, deployment_id, source_type, raw_text, structured_json,
        generated_html, ai_generated
      ) VALUES ($1, $2, 'story', $3, $4, $5, true)`,
      [userId, deploymentId, rawText, JSON.stringify(structuredJson), generatedHtml],
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
    };
  } catch (error) {
    await pool.query(
      `UPDATE deployments
       SET status = 'failed', updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [deploymentId, userId],
    );

    throw error;
  }
}

module.exports = {
  generateFromStory,
};
