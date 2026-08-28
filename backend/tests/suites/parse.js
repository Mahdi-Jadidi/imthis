const { createRunner } = require('../test-runner');
const context = require('../context');
const {
  request,
  assert,
  assertStatus,
} = require('../helpers');
const { waitForParsedContent } = require('../site-fixture');

async function parseSuite({ test, skip }) {
  let passedCount = 0;
  let parsedContent = null;

  async function run(name, fn) {
    const result = await test(name, fn);

    if (result.status === 'passed') {
      passedCount += 1;
    }

    return result;
  }

  if (!context.cvDeploymentId) {
    await skip('TEST 1: Parsed content exists for CV deployment', 'CV deployment ID not available - run upload suite first');
    await skip('TEST 2: Generated HTML is valid and complete', 'CV deployment ID not available - run upload suite first');
    await skip('TEST 3: Parsed content saved to database', 'CV deployment ID not available - run upload suite first');
    console.log(`Parse suite: ${passedCount}/3 tests passed`);
    return;
  }

  await run('TEST 1: Parsed content exists for CV deployment', async () => {
    const parsedContentRecord = await waitForParsedContent(context.cvDeploymentId, { attempts: 30, delayMs: 1000 });

    assert(parsedContentRecord, 'Expected parsed content to exist for CV deployment');

    const response = await request(
      'GET',
      `/api/parse/${context.cvDeploymentId}`,
      undefined,
      context.professionalCookie,
    );

    assertStatus(response, 200, 'Fetch parsed content');
    parsedContent = response.body?.parsedContent;
    assert(parsedContent?.deployment_id === context.cvDeploymentId, 'Expected parsed content to match the CV deployment');

    assert(parsedContent?.structured_json, 'Expected structured_json to exist');
    assert(
      String(parsedContent.structured_json.fullName || '').toLowerCase().includes('mahdi'),
      'Expected parsed fullName to contain "Mahdi"',
    );
    assert(Array.isArray(parsedContent.structured_json.skills), 'Expected skills to be an array');
    assert(typeof parsedContent.generated_html === 'string' && parsedContent.generated_html.length > 0, 'Expected generated_html');
    assert(
      parsedContent.generated_html.includes('<!doctype html>') || parsedContent.generated_html.includes('<html'),
      'Expected generated_html to contain HTML markup',
    );
  });

  await run('TEST 2: Generated HTML is valid and complete', async () => {
    if (!parsedContent) {
      return { skip: true, reason: 'Parsed content not available from previous test' };
    }

    const html = parsedContent.generated_html;

    assert(html.includes('<head>'), 'Expected generated HTML to contain <head>');
    assert(html.includes('<body>'), 'Expected generated HTML to contain <body>');
    assert(html.toLowerCase().includes('mahdi'), 'Expected generated HTML to contain the professional name');
    assert(html.length > 500, `Expected generated HTML length > 500, got ${html.length}`);
    assert(
      html.toLowerCase().includes('cardiology') ||
        html.toLowerCase().includes('research') ||
        html.toLowerCase().includes('surgery'),
      'Expected generated HTML to contain at least one skill word',
    );
  });

  await run('TEST 3: Parsed content saved to database', async () => {
    if (!parsedContent) {
      return { skip: true, reason: 'Parsed content not available from previous test' };
    }

    const structured = parsedContent.structured_json;

    assert(typeof structured.fullName === 'string' && structured.fullName.trim().length > 0, 'Expected non-empty fullName');
    assert(Array.isArray(structured.skills) && structured.skills.length >= 1, 'Expected skills array with at least one value');
    assert(Array.isArray(structured.experience), 'Expected experience to be an array');
    assert(Boolean(structured.headline || structured.summary), 'Expected headline or summary to exist');
  });

  console.log(`Parse suite: ${passedCount}/3 tests passed`);
}

module.exports = parseSuite;
module.exports.expectedTests = 3;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('parse', parseSuite, { crashFailureCount: module.exports.expectedTests })
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
