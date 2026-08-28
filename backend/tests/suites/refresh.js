const { createRunner } = require('../test-runner');
const context = require('../context');
const {
  request,
  assert,
  assertStatus,
  assertField,
} = require('../helpers');

function includesText(value, text) {
  return String(value || '').toLowerCase().includes(String(text || '').toLowerCase());
}

async function refreshSuite({ test }) {
  let passedCount = 0;

  async function run(name, fn) {
    const result = await test(name, fn);

    if (result.status === 'passed') {
      passedCount += 1;
    }

    return result;
  }

  await run('TEST 1: Refresh without token -> 401', async () => {
    const response = await request('POST', '/api/auth/refresh');

    assertStatus(response, 401, 'Refresh without token');
    assertField(response.body, 'error', 'Refresh without token');
  });

  await run('TEST 2: Refresh with malformed token -> 401', async () => {
    const response = await request('POST', '/api/auth/refresh', undefined, 'dropcv_token=not-a-real-jwt');

    assertStatus(response, 401, 'Refresh with malformed token');
  });

  await run('TEST 3: Refresh professional session -> 200', async () => {
    assert(Boolean(context.professionalCookie), 'Expected professional cookie from auth suite');

    const response = await request('POST', '/api/auth/refresh', undefined, context.professionalCookie);

    assertStatus(response, 200, 'Refresh professional session');
    assert(response.body?.success === true, 'Expected success === true');
    assert(response.body?.user?.plan === 'Standard', 'Expected refreshed plan to be Standard');
    assert(response.cookies && includesText(response.cookies, 'dropcv_token='), 'Expected a fresh dropcv_token cookie');

    // Adopt the rotated cookie so later suites keep a valid session.
    context.professionalCookie = response.cookies;
  });

  await run('TEST 4: Refreshed cookie authenticates /me -> 200', async () => {
    const response = await request('GET', '/api/auth/me', undefined, context.professionalCookie);

    assertStatus(response, 200, 'Refreshed cookie authenticates /me');
    assert(response.body?.user?.plan === 'Standard', 'Expected /me to report Standard plan after refresh');
  });

  await run('TEST 5: Refresh with revoked token -> 401', async () => {
    // Register a throwaway user, log them out (which revokes the token in Redis),
    // then confirm refresh rejects the now-revoked cookie.
    const suffix = `${context.startTime}-refresh-revoked`;
    const registration = await request('POST', '/api/auth/register', {
      email: `revoked.${suffix}@test.drop.cv`,
      password: 'RevokedPass123!',
      plan: 'Standard',
      userType: 'professional',
      slug: `revoked-user-test-${suffix}`,
      professionalProfile: {
        fullName: 'Revoked User',
        headline: 'Temp',
        city: 'Berlin',
        country: 'Germany',
        jobTitle: 'Tester',
        industry: 'Technology',
        yearsExperience: '0-2',
        seniority: 'Junior',
        skills: ['Testing'],
      },
    });

    assertStatus(registration, 201, 'Register throwaway user for revocation');
    const revokedCookie = registration.cookies;

    const logout = await request('POST', '/api/auth/logout', undefined, revokedCookie);
    assertStatus(logout, 200, 'Logout throwaway user');

    const response = await request('POST', '/api/auth/refresh', undefined, revokedCookie);
    assertStatus(response, 401, 'Refresh with revoked token');
  });

  console.log(`Refresh suite: ${passedCount}/5 tests passed`);
}

module.exports = refreshSuite;
module.exports.expectedTests = 5;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('refresh', refreshSuite, { crashFailureCount: module.exports.expectedTests })
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
