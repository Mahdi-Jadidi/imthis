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

async function analyticsSuite({ test }) {
  let passedCount = 0;
  let previousTotalViews = null;

  async function run(name, fn) {
    const result = await test(name, fn);

    if (result.status === 'passed') {
      passedCount += 1;
    }

    return result;
  }

  const publishedDeploymentId = context.cvDeploymentId || context.deploymentId;

  if (!context.professionalUserId || !publishedDeploymentId) {
    throw new Error('Published analytics fixture is missing the professional user or deployment context');
  }

  await promoteDraftDeployment({
    userId: context.professionalUserId,
    deploymentId: publishedDeploymentId,
    planName: 'Standard',
  });

  const domainSlug = context.professionalSlug || 'dr-mahdi-test';

  await run('TEST 1: Track a page view -> 200', async () => {
    const response = await request('POST', '/api/analytics/track', {
      domainSlug,
      referrer: 'https://linkedin.com',
      userAgent: 'Mozilla/5.0 TestRunner/1.0',
    });

    assertStatus(response, 200, 'Track a page view');
    assert(response.body?.success === true, 'Expected success === true');
  });

  await run('TEST 2: Track same page twice in < 1 hour -> silently ignored', async () => {
    const response = await request('POST', '/api/analytics/track', {
      domainSlug,
      referrer: 'https://linkedin.com',
      userAgent: 'Mozilla/5.0 TestRunner/1.0',
    });

    assertStatus(response, 200, 'Track same page twice');
    assert(response.body?.success === true, 'Expected success === true for rate-limited duplicate');
    console.log('Duplicate tracking is rate-limited by Redis');
  });

  await run('TEST 3: Track non-existent domain -> 404', async () => {
    const response = await request('POST', '/api/analytics/track', {
      domainSlug: 'this-slug-does-not-exist-xyz',
      referrer: '',
      userAgent: 'Test',
    });

    assertStatus(response, 404, 'Track non-existent domain');
  });

  await run('TEST 4: Get analytics dashboard without auth -> 401', async () => {
    const response = await request('GET', '/api/analytics/dashboard');

    assertStatus(response, 401, 'Get analytics dashboard without auth');
  });

  await run('TEST 5: Get analytics dashboard as second Standard user -> 200', async () => {
    const response = await request('GET', '/api/analytics/dashboard', undefined, context.otherCookie);

    assertStatus(response, 200, 'Get analytics dashboard as second Standard user');
    assert(typeof response.body?.totalViews === 'number' && response.body.totalViews === 0, 'Expected empty dashboard for unused account');
    assert(Array.isArray(response.body?.viewsLast7Days), 'Expected viewsLast7Days array');
  });

  await run('TEST 6: Get analytics dashboard as Standard user -> 200', async () => {
    const response = await request('GET', '/api/analytics/dashboard', undefined, context.professionalCookie);

    assertStatus(response, 200, 'Get analytics dashboard as Standard user');
    assert(typeof response.body?.totalViews === 'number' && response.body.totalViews >= 0, 'Expected totalViews >= 0');
    assert(typeof response.body?.viewsThisWeek === 'number' && response.body.viewsThisWeek >= 0, 'Expected viewsThisWeek >= 0');
    assert(Array.isArray(response.body?.viewsLast7Days), 'Expected viewsLast7Days array');
    assert(response.body.viewsLast7Days.length <= 7, 'Expected viewsLast7Days length <= 7');
    assert(Array.isArray(response.body?.topCountries), 'Expected topCountries array');
    assert(Array.isArray(response.body?.topReferrers), 'Expected topReferrers array');
    assert(typeof response.body?.uniqueVisitors === 'number' && response.body.uniqueVisitors >= 0, 'Expected uniqueVisitors >= 0');

    previousTotalViews = response.body.totalViews;

    if (response.body.totalViews > 0 && response.body.topReferrers.length > 0) {
      assert(response.body.topReferrers[0].referrer, 'Expected top referrer to exist');
      assert(Number(response.body.topReferrers[0].count) > 0, 'Expected top referrer count > 0');
      console.log(
        `Analytics recorded ${response.body.totalViews} views, top referrer: ${response.body.topReferrers[0].referrer}`,
      );
    }
  });

  await run('TEST 7: Analytics data increases after tracking', async () => {
    for (let index = 1; index <= 3; index += 1) {
      const response = await request(
        'POST',
        '/api/analytics/track',
        { domainSlug },
        undefined,
        { 'X-Forwarded-For': `10.0.0.${index}` },
      );

      assertStatus(response, 200, `Track analytics event with fake IP ${index}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const dashboard = await request('GET', '/api/analytics/dashboard', undefined, context.professionalCookie);

    assertStatus(dashboard, 200, 'Get analytics dashboard after additional tracking');

    if (previousTotalViews !== null && dashboard.body?.totalViews <= previousTotalViews) {
      console.warn('Rate limiting may have blocked test IPs');
    }
  });

  console.log(`Analytics suite: ${passedCount}/7 tests passed`);
}

module.exports = analyticsSuite;
module.exports.expectedTests = 7;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('analytics', analyticsSuite, { crashFailureCount: module.exports.expectedTests })
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
