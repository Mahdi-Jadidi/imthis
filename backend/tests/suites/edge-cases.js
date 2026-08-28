const { createRunner } = require('../test-runner');
const context = require('../context');
const {
  request,
  uploadFile,
  assert,
  assertStatus,
  assertField,
} = require('../helpers');

function includesText(value, text) {
  return String(value || '').toLowerCase().includes(String(text || '').toLowerCase());
}

const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

async function edgeCasesSuite({ test }) {
  let passedCount = 0;

  async function run(name, fn) {
    const result = await test(name, fn);

    if (result.status === 'passed') {
      passedCount += 1;
    }

    return result;
  }

  // ---- Parse route gates -------------------------------------------------

  await run('TEST 1: GET /api/parse/:id without auth -> 401', async () => {
    const response = await request('GET', `/api/parse/${context.cvDeploymentId || FAKE_UUID}`);

    assertStatus(response, 401, 'GET parse content without auth');
  });

  await run('TEST 2: POST /api/parse/:id without auth -> 401', async () => {
    const response = await request('POST', `/api/parse/${context.cvDeploymentId || FAKE_UUID}`, {});

    assertStatus(response, 401, 'POST re-parse without auth');
  });

  await run('TEST 3: POST /api/parse/:id as another user -> 403 or 404', async () => {
    if (!context.otherCookie) {
      return { skip: true, reason: 'Second user cookie not available - run auth suite first' };
    }

    const response = await request('POST', `/api/parse/${FAKE_UUID}`, {}, context.otherCookie);

    assert([403, 404].includes(response.status), `Expected 403 or 404, got ${response.status}`);
    assert(
      includesText(response.body?.error, 'plan') ||
        includesText(response.body?.error, 'higher') ||
        includesText(response.body?.error, 'not found'),
      'Expected ownership or access error',
    );
  });

  await run('TEST 4: GET parsed content for non-existent deployment -> 404', async () => {
    const response = await request('GET', `/api/parse/${FAKE_UUID}`, undefined, context.professionalCookie);

    assertStatus(response, 404, 'Parsed content for non-existent deployment');
  });

  await run('TEST 5: GET another user\'s parsed content -> 404', async () => {
    if (!context.cvDeploymentId) {
      return { skip: true, reason: 'CV deployment ID not available - run upload suite first' };
    }

    const response = await request('GET', `/api/parse/${context.cvDeploymentId}`, undefined, context.otherCookie);

    // Ownership is scoped to the requesting user, so another user's id should not resolve.
    assert([403, 404].includes(response.status), `Expected 403 or 404, got ${response.status}`);
  });

  // ---- Upload status gate ------------------------------------------------

  await run('TEST 6: Upload status for non-existent deployment -> 404', async () => {
    const response = await request('GET', `/api/upload/status/${FAKE_UUID}`, undefined, context.professionalCookie);

    assert([403, 404].includes(response.status), `Expected 403 or 404, got ${response.status}`);
  });

  await run('TEST 7: Upload CV with wrong multipart field -> 400', async () => {
    // multipart with the wrong file field should be rejected as a bad request.
    const response = await uploadFile(
      '/api/upload/cv',
      'notafile',
      '',
      'just-a-field-value',
      'text/plain',
      context.professionalCookie,
    );

    assert([400, 415].includes(response.status), `Expected 400 or 415, got ${response.status}`);
    assert(
      includesText(response.body?.error, 'cv') || includesText(response.body?.error, 'file') || includesText(response.body?.error, 'field'),
      'Expected upload field error',
    );
  });

  // ---- Analytics validation ---------------------------------------------

  await run('TEST 8: Track with missing domainSlug -> 4xx', async () => {
    const response = await request('POST', '/api/analytics/track', {
      referrer: 'https://example.com',
      userAgent: 'Test',
    });

    assert(response.status >= 400 && response.status < 500, `Expected 4xx, got ${response.status}`);
  });

  // ---- Users placeholder route ------------------------------------------

  await run('TEST 9: GET /api/users/me route is registered -> not 404', async () => {
    const response = await request('GET', '/api/users/me', undefined, context.professionalCookie);

    assert(response.status !== 404, 'Expected /api/users/me route to be registered');
  });

  console.log(`Edge-cases suite: ${passedCount}/9 tests passed`);
}

module.exports = edgeCasesSuite;
module.exports.expectedTests = 9;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('edge-cases', edgeCasesSuite, { crashFailureCount: module.exports.expectedTests })
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
