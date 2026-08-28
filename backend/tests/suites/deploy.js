const { createRunner } = require('../test-runner');
const context = require('../context');
const {
  request,
  assert,
  assertStatus,
} = require('../helpers');
const { promoteDraftDeployment } = require('../site-fixture');

function includesText(value, text) {
  return String(value || '').toLowerCase().includes(String(text || '').toLowerCase());
}

// The deploy route renders a user's published resume keyed by the `x-slug`
// header, which nginx injects from the requested subdomain. We set it directly
// to exercise the handler the way the edge proxy would.
async function deploySuite({ test }) {
  let passedCount = 0;

  async function run(name, fn) {
    const result = await test(name, fn);

    if (result.status === 'passed') {
      passedCount += 1;
    }

    return result;
  }

  const publishedDeploymentId = context.cvDeploymentId || context.deploymentId;

  if (!context.professionalUserId || !publishedDeploymentId || !context.professionalSlug) {
    throw new Error('Published deploy fixture is missing the professional user, slug, or deployment context');
  }

  await promoteDraftDeployment({
    userId: context.professionalUserId,
    deploymentId: publishedDeploymentId,
    planName: 'Standard',
  });

  await run('TEST 1: Wildcard route without x-slug -> 404 JSON', async () => {
    const response = await request('GET', '/', undefined, undefined);

    assertStatus(response, 404, 'Wildcard route without x-slug');
    assert(includesText(response.body?.error, 'not found'), 'Expected "Not found" error body');
  });

  await run('TEST 2: Unknown slug -> 404 HTML', async () => {
    const response = await request('GET', '/', undefined, undefined, {
      'x-slug': 'this-slug-does-not-exist-xyz',
    });

    assertStatus(response, 404, 'Unknown slug');
    assert(includesText(response.headers['content-type'], 'text/html'), 'Expected HTML content type');
    assert(includesText(response.body, 'not found'), 'Expected "Resume not found" page');
  });

  await run('TEST 3: Published slug serves resume HTML -> 200', async () => {
    const response = await request('GET', '/', undefined, undefined, {
      'x-slug': context.professionalSlug,
    });

    assertStatus(response, 200, 'Published slug serves resume HTML');
    assert(includesText(response.headers['content-type'], 'text/html'), 'Expected HTML content type');

    assert(typeof response.body === 'string' && response.body.length > 0, 'Expected non-empty HTML body');
    assert(
      includesText(response.body, '<html') || includesText(response.body, '<!doctype html'),
      'Expected served body to contain HTML markup',
    );
    assert(
      includesText(response.headers['cache-control'], 'no-store'),
      'Expected published resume route to be served without cache storage',
    );
  });

  await run('TEST 4: Deploy prefix is reachable (no x-slug) -> 404', async () => {
    const response = await request('GET', '/api/deploy/anything', undefined, undefined);

    assert(response.status !== 0, 'Expected the deploy prefix route to be reachable');
    assertStatus(response, 404, 'Deploy prefix without x-slug');
  });

  console.log(`Deploy suite: ${passedCount}/4 tests passed`);
}

module.exports = deploySuite;
module.exports.expectedTests = 4;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('deploy', deploySuite, { crashFailureCount: module.exports.expectedTests })
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
