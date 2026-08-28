const { createRunner } = require('../test-runner');
const { request, assert, assertStatus } = require('../helpers');

async function healthSuite({ test }) {
  await test('GET /health returns 200, status ok, and responds under 500ms', async () => {
    const startedAt = Date.now();
    const response = await request('GET', '/health');
    const durationMs = Date.now() - startedAt;

    assertStatus(response, 200, 'GET /health');
    assert(response.body && response.body.status === 'ok', 'Expected health body to include { status: "ok" }');
    assert(durationMs < 500, `Expected /health response under 500ms, got ${durationMs}ms`);

    console.log('Server is reachable and healthy');
  });

  await test('Database connection check via health endpoint', async () => {
    const response = await request('GET', '/health');

    if (response.status !== 200) {
      console.warn('Check PostgreSQL connection');
    }

    assertStatus(response, 200, 'Database connection via /health');
  });

  await test('All route prefixes are registered', async () => {
    const expectations = [
      { path: '/api/auth/me', allowedStatuses: [401] },
      { path: '/api/analytics/dashboard', allowedStatuses: [401] },
      { path: '/api/payments/request', method: 'POST', allowedStatuses: [401] },
      { path: '/api/preview/00000000-0000-0000-0000-000000000000', allowedStatuses: [401] },
      { path: '/api/sites/00000000-0000-0000-0000-000000000000/unpublish', method: 'POST', allowedStatuses: [401] },
    ];

    for (const item of expectations) {
      const response = await request(item.method || 'GET', item.path, item.body);

      assert(response.status !== 404, `Route not registered: ${item.path}`);
      assert(
        item.allowedStatuses.includes(response.status),
        `Unexpected status for ${item.path}: ${response.status}. Body: ${JSON.stringify(response.body)}`,
      );
    }
  });

  await test('CORS allows subdomain origin', async () => {
    const origin = 'https://mahdi-jadidi.drop.cv';
    const response = await request('OPTIONS', '/api/auth/me', null, null, {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type',
    });

    assert([200, 204].includes(response.status), `Expected preflight success, got ${response.status}`);
    assert(
      response.headers['access-control-allow-origin'] === origin,
      `Expected Access-Control-Allow-Origin to equal ${origin}, got ${response.headers['access-control-allow-origin']}`,
    );
    assert(
      response.headers['access-control-allow-credentials'] === 'true',
      `Expected Access-Control-Allow-Credentials to equal true, got ${response.headers['access-control-allow-credentials']}`,
    );
  });

  await test('CORS blocks unknown origin', async () => {
    const origin = 'https://evil-site.com';
    const response = await request('OPTIONS', '/api/auth/me', null, null, {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
    });

    assert([403, 500].includes(response.status), `Expected blocked preflight, got ${response.status}`);
    assert(
      response.headers['access-control-allow-origin'] !== origin,
      'Expected unknown origin not to be echoed back in Access-Control-Allow-Origin',
    );
  });

  await test('CORS allows main frontend origin', async () => {
    const origin = 'http://localhost:8080';
    const response = await request('OPTIONS', '/api/auth/me', null, null, {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type',
    });

    assert([200, 204].includes(response.status), `Expected preflight success, got ${response.status}`);
    assert(
      response.headers['access-control-allow-origin'] === origin,
      `Expected Access-Control-Allow-Origin to equal ${origin}, got ${response.headers['access-control-allow-origin']}`,
    );
  });
}

module.exports = healthSuite;
module.exports.expectedTests = 6;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('health', healthSuite)
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
