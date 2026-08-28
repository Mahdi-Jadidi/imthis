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

function getProfileValue(profile, camelKey, snakeKey) {
  if (!profile) {
    return undefined;
  }

  if (profile[camelKey] !== undefined) {
    return profile[camelKey];
  }

  return profile[snakeKey];
}

async function authSuite({ test }) {
  const suffix = String(context.startTime);
  const professionalEmail = `dr.mahdi.${suffix}@test.drop.cv`;
  const secondEmail = `sara.${suffix}@test.drop.cv`;
  const duplicateSlug = `dr-mahdi-test-${suffix}`;
  let passedCount = 0;

  async function run(name, fn) {
    const result = await test(name, fn);

    if (result.status === 'passed') {
      passedCount += 1;
    }

    return result;
  }

  await run('TEST 1: Register with missing fields -> 400', async () => {
    const response = await request('POST', '/api/auth/register', {});

    assertStatus(response, 400, 'Register with missing fields');
    assertField(response.body, 'error', 'Register with missing fields');
  });

  await run('TEST 2: Register with invalid email -> 400', async () => {
    const response = await request('POST', '/api/auth/register', {
      email: 'notanemail',
      password: 'Test1234!',
    });

    assertStatus(response, 400, 'Register with invalid email');
    assert(includesText(response.body?.error, 'email'), 'Expected error to mention email');
  });

  await run('TEST 3: Register with short password -> 400', async () => {
    const response = await request('POST', '/api/auth/register', {
      email: 'test@drop.cv',
      password: '123',
    });

    assertStatus(response, 400, 'Register with short password');
    assert(includesText(response.body?.error, 'password'), 'Expected error to mention password');
  });

  await run('TEST 4: Register professional user successfully -> 201', async () => {
    const response = await request('POST', '/api/auth/register', {
      email: professionalEmail,
      password: 'TestPass123!',
      plan: 'Standard',
      userType: 'professional',
      slug: duplicateSlug,
      professionalProfile: {
        fullName: 'Dr. Mahdi Jadidi',
        headline: 'Senior Cardiologist | 12 years experience',
        city: 'Tehran',
        country: 'Iran',
        jobTitle: 'Senior Cardiologist',
        industry: 'Medicine',
        yearsExperience: '10-15',
        seniority: 'Senior',
        skills: ['Cardiology', 'Research', 'Surgery'],
        openToWork: true,
        availability: 'In 1 month',
        workTypes: ['Full-time'],
      },
    });

    assertStatus(response, 201, 'Register professional user');
    assert(response.body?.success === true, 'Expected success === true');
    assert(response.body?.user?.email === professionalEmail, 'Expected professional email to match');
    assert(response.body?.user?.plan === 'Standard', 'Expected professional plan to be Standard');
    assert(response.cookies && includesText(response.cookies, 'dropcv_token='), 'Expected dropcv_token cookie');

    context.professionalCookie = response.cookies;
    context.professionalUserId = response.body.user.id;
  });

  await run('TEST 5: Register duplicate email -> 409 or 400', async () => {
    const response = await request('POST', '/api/auth/register', {
      email: professionalEmail,
      password: 'TestPass123!',
      plan: 'Standard',
      userType: 'professional',
      slug: `${duplicateSlug}-different`,
      professionalProfile: {
        fullName: 'Dr. Mahdi Jadidi',
      },
    });

    assert([400, 409].includes(response.status), `Expected 400 or 409, got ${response.status}`);
    assert(
      includesText(response.body?.error, 'email') ||
        includesText(response.body?.field, 'email') ||
        includesText(response.body?.error, 'registered'),
      'Expected duplicate email error',
    );
  });

  await run('TEST 6: Register duplicate inactive slug -> 201', async () => {
    const response = await request('POST', '/api/auth/register', {
      email: `other.${suffix}@test.drop.cv`,
      password: 'TestPass123!',
      plan: 'Standard',
      userType: 'professional',
      slug: duplicateSlug,
      professionalProfile: {
        fullName: 'Another Doctor',
      },
    });

    assertStatus(response, 201, 'Register duplicate inactive slug');
    assert(response.body?.user?.email === `other.${suffix}@test.drop.cv`, 'Expected duplicate slug user email');
  });

  await run('TEST 7: Register second Standard user successfully -> 201', async () => {
    const response = await request('POST', '/api/auth/register', {
      email: secondEmail,
      password: 'SecondPass123!',
      plan: 'Standard',
      userType: 'professional',
      slug: `sara-standard-test-${suffix}`,
      professionalProfile: {
        fullName: 'Sara Ahmadi',
        headline: 'Product Strategist | Content Lead',
        city: 'Shiraz',
        country: 'Iran',
        jobTitle: 'Product Strategist',
        industry: 'Technology',
        yearsExperience: '5-8',
        seniority: 'Mid',
        skills: ['Strategy', 'Writing', 'Analytics'],
      },
    });

    assertStatus(response, 201, 'Register second Standard user');
    assert(response.body?.user?.userType === 'professional', 'Expected second userType to be professional');
    assert(response.cookies && includesText(response.cookies, 'dropcv_token='), 'Expected second user cookie');

    context.otherCookie = response.cookies;
    context.otherUserId = response.body.user.id;
  });

  await run('TEST 8: Login with wrong password -> 401', async () => {
    const response = await request('POST', '/api/auth/login', {
      email: professionalEmail,
      password: 'WrongPassword',
    });

    assertStatus(response, 401, 'Login with wrong password');
    assertField(response.body, 'error', 'Login with wrong password');
  });

  await run('TEST 9: Login with non-existent email -> 401', async () => {
    const response = await request('POST', '/api/auth/login', {
      email: 'nobody@nowhere.com',
      password: 'AnyPassword123!',
    });

    assertStatus(response, 401, 'Login with non-existent email');
  });

  await run('TEST 10: Login professional user successfully -> 200', async () => {
    const response = await request('POST', '/api/auth/login', {
      email: professionalEmail,
      password: 'TestPass123!',
    });

    assertStatus(response, 200, 'Login professional user');
    assert(response.body?.user?.email === professionalEmail, 'Expected professional login email');
    assert(response.body?.user?.plan === 'Standard', 'Expected professional plan to be Standard');
    assert(response.cookies && includesText(response.cookies, 'dropcv_token='), 'Expected professional login cookie');

    context.professionalCookie = response.cookies;
  });

  await run('TEST 11: Login second Standard user successfully -> 200', async () => {
    const response = await request('POST', '/api/auth/login', {
      email: secondEmail,
      password: 'SecondPass123!',
    });

    assertStatus(response, 200, 'Login second Standard user');
    assert(response.body?.user?.userType === 'professional', 'Expected second login userType to be professional');

    context.otherCookie = response.cookies;
  });

  await run('TEST 12: GET /api/auth/me without auth -> 401', async () => {
    const response = await request('GET', '/api/auth/me');

    assertStatus(response, 401, 'GET /api/auth/me without auth');
  });

  await run('TEST 13: GET /api/auth/me as professional -> 200', async () => {
    const response = await request('GET', '/api/auth/me', undefined, context.professionalCookie);

    assertStatus(response, 200, 'GET /api/auth/me as professional');
    assert(response.body?.user?.email === professionalEmail, 'Expected professional /me email');
    assert(response.body?.user?.plan === 'Standard', 'Expected professional /me plan to be Standard');

    const profile = response.body?.user?.profile;
    const fullName = getProfileValue(profile, 'fullName', 'full_name');
    const skills = getProfileValue(profile, 'skills', 'skills') || [];
    const domains = response.body?.user?.domains;
    const fallbackSlug = response.body?.user?.slug;

    assert(fullName === 'Dr. Mahdi Jadidi', 'Expected professional full name');
    assert(Array.isArray(skills) && skills.includes('Cardiology'), 'Expected Cardiology skill');
    assert(
      (Array.isArray(domains) && domains.length >= 1) || Boolean(fallbackSlug),
      'Expected domains array or fallback slug to exist',
    );

    context.professionalSlug = Array.isArray(domains) && domains[0] ? domains[0].slug : fallbackSlug;
  });

  await run('TEST 14: GET /api/auth/me as second Standard user -> 200', async () => {
    const response = await request('GET', '/api/auth/me', undefined, context.otherCookie);

    assertStatus(response, 200, 'GET /api/auth/me as second Standard user');
    assert(response.body?.user?.userType === 'professional', 'Expected second /me userType to be professional');

    const profile = response.body?.user?.profile;
    const fullName = getProfileValue(profile, 'fullName', 'full_name');
    assert(fullName === 'Sara Ahmadi', 'Expected second user full name');
  });

  await run('TEST 15: Logout -> 200', async () => {
    const response = await request('POST', '/api/auth/logout', undefined, context.professionalCookie);

    assertStatus(response, 200, 'POST /api/auth/logout');
    assert(
      response.setCookieHeaders.some((header) => includesText(header, 'dropcv_token=') && (
        includesText(header, 'max-age=0') || includesText(header, 'expires=')
      )),
      'Expected logout to clear dropcv_token cookie',
    );
  });

  await run('TEST 16: GET /api/auth/me after logout -> 401', async () => {
    const response = await request('GET', '/api/auth/me', undefined, context.professionalCookie);

    assertStatus(response, 401, 'GET /api/auth/me after logout');
  });

  await run('TEST 17: Re-login to restore session', async () => {
    const response = await request('POST', '/api/auth/login', {
      email: professionalEmail,
      password: 'TestPass123!',
    });

    assertStatus(response, 200, 'Re-login professional user');
    assert(response.cookies && includesText(response.cookies, 'dropcv_token='), 'Expected restored professional cookie');
    context.professionalCookie = response.cookies;
  });

  console.log(`Auth suite: ${passedCount}/17 tests passed`);
}

module.exports = authSuite;
module.exports.expectedTests = 17;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('auth', authSuite)
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
