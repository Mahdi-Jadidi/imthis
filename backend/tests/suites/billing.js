const { createRunner } = require('../test-runner');
const context = require('../context');
const { pool } = require('../../src/config/db');
const {
  request,
  uploadFile,
  assert,
  assertStatus,
  assertField,
} = require('../helpers');
const { waitForParsedContent, promoteDraftDeployment } = require('../site-fixture');

function includesText(value, text) {
  return String(value || '').toLowerCase().includes(String(text || '').toLowerCase());
}

function buildMinimalPdf(nameText) {
  return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 104 >>
stream
BT
/F1 18 Tf
72 720 Td
(${nameText}) Tj
0 -28 Td
(Senior Cardiologist) Tj
0 -28 Td
(Tehran, Iran) Tj
0 -28 Td
(Skills: Cardiology, Research, Surgery) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000122 00000 n 
0000000248 00000 n 
0000000403 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
473
%%EOF`;
}

function publicShellHeaders(response) {
  return {
    contentType: response.headers['content-type'] || '',
    cacheControl: response.headers['cache-control'] || '',
    csp: response.headers['content-security-policy'] || '',
    referrerPolicy: response.headers['referrer-policy'] || '',
    permissionsPolicy: response.headers['permissions-policy'] || '',
  };
}

async function billingSuite({ test, skip }) {
  let passedCount = 0;
  const trialSlug = context.professionalSlug;
  const trialCookie = context.professionalCookie;
  const trialDeploymentId = context.cvDeploymentId;
  const billingSuffix = String(context.startTime);
  const paidEmail = `billing.paid.${billingSuffix}@test.drop.cv`;
  const paidSlug = `billing-paid-test-${billingSuffix}`;

  async function run(name, fn) {
    const result = await test(name, fn);

    if (result.status === 'passed') {
      passedCount += 1;
    }

    return result;
  }

  if (!trialSlug || !trialCookie || !trialDeploymentId) {
    await skip('TEST 1: Trial user can publish without payment -> 200', 'Required trial/paid fixtures are not available');
    await skip('TEST 2: Paid site serves the same public shell headers as trial site -> 200', 'Required trial/paid fixtures are not available');
    await skip('TEST 3: Offline_grace user is blocked from public viewing -> 402', 'Required trial/paid fixtures are not available');
    console.log(`Billing suite: ${passedCount}/3 tests passed`);
    return;
  }

  let trialResponse = null;
  let paidUserId = null;

  await run('TEST 1: Trial user can publish without payment -> 200', async () => {
    const siteStatus = await request(
      'GET',
      '/api/users/site-status',
      undefined,
      trialCookie,
    );

    assertStatus(siteStatus, 200, 'Fetch trial site status');
    assert(siteStatus.body?.status === 'trial', `Expected trial status, got ${JSON.stringify(siteStatus.body)}`);
    assert(siteStatus.body?.siteStatus === 'trial', `Expected trial siteStatus, got ${JSON.stringify(siteStatus.body)}`);

    const response = await request('GET', '/', undefined, undefined, {
      'x-slug': trialSlug,
    });

    trialResponse = response;

    assertStatus(response, 200, 'Trial public site');
    assert(includesText(response.headers['content-type'], 'text/html'), 'Expected trial site to be HTML');
    assert(includesText(response.headers['cache-control'], 'no-store'), 'Expected trial site to be no-store');
    assert(
      includesText(response.body, '<html') || includesText(response.body, '<!doctype html'),
      'Expected trial site to include HTML markup',
    );
    assert(!includesText(response.body, 'site paused'), 'Expected trial site to be publicly live');
  });

  await run('TEST 2: Paid site serves the same public shell headers as trial site -> 200', async () => {
    const registerResponse = await request('POST', '/api/auth/register', {
      email: paidEmail,
      password: 'BillingPass123!',
      plan: 'Standard',
      userType: 'professional',
      slug: paidSlug,
      professionalProfile: {
        fullName: 'Billing Test User',
        headline: 'Operations Lead',
        city: 'Tehran',
        country: 'Iran',
      },
    });

    assertStatus(registerResponse, 201, 'Register paid comparison user');
    assert(registerResponse.cookies && includesText(registerResponse.cookies, 'dropcv_token='), 'Expected paid comparison cookie');

    const paidCookie = registerResponse.cookies;
    paidUserId = registerResponse.body?.user?.id;
    assert(paidUserId, 'Expected paid comparison user ID');

    const uploadResponse = await uploadFile(
      '/api/upload/cv',
      'cv',
      'paid-site.pdf',
      buildMinimalPdf('Sara Ahmadi'),
      'application/pdf',
      paidCookie,
    );

    assert([200, 201].includes(uploadResponse.status), `Expected 200 or 201, got ${uploadResponse.status}`);
    assertField(uploadResponse.body, 'deploymentId', 'Upload paid comparison CV');

    const deploymentId = uploadResponse.body.deploymentId;
    const parsedContent = await waitForParsedContent(deploymentId, { attempts: 30, delayMs: 1000 });

    assert(parsedContent, 'Expected parsed content for paid comparison deployment');

    await promoteDraftDeployment({
      userId: paidUserId,
      deploymentId,
      planName: 'Standard',
    });

    const siteStatus = await request(
      'GET',
      '/api/users/site-status',
      undefined,
      paidCookie,
    );

    assertStatus(siteStatus, 200, 'Fetch paid site status');
    assert(siteStatus.body?.status === 'active', `Expected active status, got ${JSON.stringify(siteStatus.body)}`);
    assert(siteStatus.body?.siteStatus === 'active', `Expected active siteStatus, got ${JSON.stringify(siteStatus.body)}`);

    const response = await request('GET', '/', undefined, undefined, {
      'x-slug': paidSlug,
    });

    assertStatus(response, 200, 'Paid public site');
    assert(includesText(response.headers['content-type'], 'text/html'), 'Expected paid site to be HTML');
    assert(includesText(response.headers['cache-control'], 'no-store'), 'Expected paid site to be no-store');
    assert(
      includesText(response.body, '<html') || includesText(response.body, '<!doctype html'),
      'Expected paid site to include HTML markup',
    );
    assert(!includesText(response.body, 'site paused'), 'Expected paid site to be publicly live');

    assert(trialResponse, 'Expected the trial response from the previous test');
    const trialHeaders = publicShellHeaders(trialResponse);
    const paidHeaders = publicShellHeaders(response);

    assert(paidHeaders.contentType === trialHeaders.contentType, 'Expected public content types to match');
    assert(paidHeaders.cacheControl === trialHeaders.cacheControl, 'Expected cache-control headers to match');
    assert(paidHeaders.csp === trialHeaders.csp, 'Expected content-security-policy headers to match');
    assert(paidHeaders.referrerPolicy === trialHeaders.referrerPolicy, 'Expected referrer-policy headers to match');
    assert(
      paidHeaders.permissionsPolicy === trialHeaders.permissionsPolicy,
      'Expected permissions-policy headers to match',
    );
  });

  await run('TEST 3: Offline_grace user is blocked from public viewing -> 402', async () => {
    await pool.query(
      `UPDATE subscriptions
       SET status = 'expired',
         site_status = 'offline_grace',
         is_paid = false,
         trial_ends_at = NOW() - INTERVAL '1 day',
         grace_ends_at = NOW() + INTERVAL '1 day',
         updated_at = NOW()
       WHERE user_id = $1`,
      [paidUserId],
    );

    const response = await request('GET', '/', undefined, undefined, {
      'x-slug': paidSlug,
    });

    assertStatus(response, 402, 'Offline grace public site');
    assert(includesText(response.headers['content-type'], 'text/html'), 'Expected paused page to be HTML');
    assert(includesText(response.body, 'paused'), 'Expected paused page content');
  });

  console.log(`Billing suite: ${passedCount}/3 tests passed`);
}

module.exports = billingSuite;
module.exports.expectedTests = 3;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('billing', billingSuite, { crashFailureCount: module.exports.expectedTests })
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
