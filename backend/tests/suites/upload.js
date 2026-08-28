const { createRunner } = require('../test-runner');
const context = require('../context');
const {
  request,
  uploadFile,
  uploadMultipart,
  assert,
  assertStatus,
  assertField,
} = require('../helpers');
const { waitForParsedContent } = require('../site-fixture');
const JSZip = require('jszip');

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

const MINIMAL_DOCX_BASE64 = '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';

function buildMinimalDocx() {
  return Buffer.from(MINIMAL_DOCX_BASE64, 'base64');
}

async function buildStaticSiteZip() {
  const zip = new JSZip();

  zip.file(
    'portfolio/index.html',
    '<!doctype html><html><head><meta charset="utf-8"><title>Zip Portfolio</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Zip bundle site</h1><p>This bundle was uploaded from a ZIP archive.</p><script src="app.js"></script></main></body></html>',
  );
  zip.file(
    'portfolio/styles.css',
    'body{font-family:Inter,system-ui,sans-serif;background:#f4f7f5;color:#0f6e56;padding:40px} main{max-width:720px;margin:0 auto}',
  );
  zip.file(
    'portfolio/app.js',
    "document.body.setAttribute('data-zip-site','ready');",
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function uploadSuite({ test, skip }) {
  let passedCount = 0;
  const suffix = String(context.startTime);

  async function run(name, fn) {
    const result = await test(name, fn);

    if (result.status === 'passed') {
      passedCount += 1;
    }

    return result;
  }

  await run('TEST 1: Upload without auth -> 401', async () => {
    const response = await uploadFile(
      '/api/upload/cv',
      'cv',
      'site.docx',
      buildMinimalDocx(),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    assertStatus(response, 401, 'Upload without auth');
  });

  await run('TEST 2: Upload wrong file type -> 400', async () => {
    const response = await uploadFile(
      '/api/upload/cv',
      'cv',
      'malware.exe',
      'pretend-binary-content',
      'application/octet-stream',
      context.professionalCookie,
    );

    assertStatus(response, 400, 'Upload wrong file type');
    assert(
      includesText(response.body?.error, 'file') || includesText(response.body?.error, 'type'),
      'Expected file type error',
    );
  });

  await run('TEST 3: Upload valid DOCX CV (Standard plan) -> 200/201', async () => {
    const response = await uploadFile(
      '/api/upload/cv',
      'cv',
      'cv.docx',
      buildMinimalDocx(),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      context.professionalCookie,
    );

    assert([200, 201].includes(response.status), `Expected 200 or 201, got ${response.status}`);
    assertField(response.body, 'deploymentId', 'Upload valid DOCX CV');
    assert(
      ['processing', 'draft'].includes(response.body?.status),
      `Unexpected deployment status: ${response.body?.status}`,
    );

    context.deploymentId = response.body.deploymentId;
  });

  await run('TEST 4: Check deployment status -> 200', async () => {
    const response = await request(
      'GET',
      `/api/upload/status/${context.deploymentId}`,
      undefined,
      context.professionalCookie,
    );

    assertStatus(response, 200, 'Check deployment status');
    assertField(response.body, 'deploymentId', 'Check deployment status');
    assert(
      ['processing', 'draft', 'live'].includes(response.body?.status),
      `Unexpected deployment status: ${response.body?.status}`,
    );
    assert(
      ['docx'].includes(response.body?.method),
      `Unexpected deployment method: ${response.body?.method}`,
    );
  });

  await run('TEST 5: Check status of another user\'s deployment -> 403 or 404', async () => {
    const response = await request(
      'GET',
      `/api/upload/status/${context.deploymentId}`,
      undefined,
      context.otherCookie,
    );

    assert([403, 404].includes(response.status), `Expected 403 or 404, got ${response.status}`);
  });

  await run('TEST 6: Upload invalid CV file type -> 400', async () => {
    const response = await uploadFile(
      '/api/upload/cv',
      'cv',
      'image.png',
      'not-a-real-png',
      'image/png',
      context.professionalCookie,
    );

    assertStatus(response, 400, 'Upload invalid CV file type');
  });

  await run('TEST 7: Upload PDF CV (Standard plan) -> 200/201', async () => {
    const response = await uploadFile(
      '/api/upload/cv',
      'cv',
      'cv.pdf',
      buildMinimalPdf('Dr. Mahdi Jadidi'),
      'application/pdf',
      context.professionalCookie,
    );

    assert([200, 201].includes(response.status), `Expected 200 or 201, got ${response.status}`);
    assertField(response.body, 'deploymentId', 'Upload PDF CV');

    context.cvDeploymentId = response.body.deploymentId;
  });

  await run('TEST 8: Poll deployment status until draft or live', async () => {
    const parsed = await waitForParsedContent(context.cvDeploymentId, { attempts: 30, delayMs: 1000 });

    assert(parsed, 'Expected parsed content to become available for the CV deployment');

    const statusResponse = await request(
      'GET',
      `/api/upload/status/${context.cvDeploymentId}`,
      undefined,
      context.professionalCookie,
    );

    assertStatus(statusResponse, 200, 'Check parsed CV deployment status');
    assert(
      ['draft', 'live'].includes(statusResponse.body?.status),
      `Unexpected final status: ${JSON.stringify(statusResponse.body)}`,
    );
  });

  await run('TEST 9: Standard user site upload -> 402 upgrade gate', async () => {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Blocked Site</title></head><body><h1>Standard plan should not publish this</h1></body></html>';
    const response = await uploadFile(
      '/api/sites/upload',
      'site',
      'index.html',
      html,
      'text/html',
      context.professionalCookie,
    );

    assertStatus(response, 402, 'Standard user site upload');
    assert(
      includesText(response.body?.error, 'premium') || includesText(response.body?.error, 'upgrade'),
      'Expected a premium upgrade message for standard users',
    );
    assert(
      includesText(response.body?.upgradeUrl, 'signup.html') || includesText(response.body?.upgradeUrl, 'premium'),
      'Expected an upgrade URL for standard users',
    );
  });

  await run('TEST 10: Premium user uploads a single HTML site -> 201 and public link', async () => {
    const siteSlug = `site-user-test-${suffix}`;
    const registration = await request('POST', '/api/auth/register', {
      email: `site.user.${suffix}@test.drop.cv`,
      password: 'SitePass123!',
      plan: 'Premium',
      userType: 'professional',
      slug: siteSlug,
      professionalProfile: {
        fullName: 'Site User',
        headline: 'Frontend Developer',
      },
    });

    assertStatus(registration, 201, 'Register premium site upload user');

    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Site Upload</title><style>body{font-family:sans-serif;padding:48px;color:#0f6e56}</style></head><body><h1>Hello from drop.cv</h1><p>This page was uploaded as a simple HTML file.</p></body></html>';
    const response = await uploadFile(
      '/api/sites/upload',
      'site',
      'index.html',
      html,
      'text/html',
      registration.cookies,
    );

    assert([200, 201].includes(response.status), `Expected 200 or 201, got ${response.status}`);
    assertField(response.body, 'deploymentId', 'Upload HTML site');
    assert(
      response.body?.status === 'live',
      `Unexpected site upload status: ${response.body?.status}`,
    );

    const publicResponse = await request('GET', '/', undefined, null, { 'x-slug': siteSlug });
    assertStatus(publicResponse, 200, 'Public HTML site request');
    assert(
      includesText(publicResponse.headers?.['content-type'], 'text/html'),
      `Expected HTML content-type, got ${publicResponse.headers?.['content-type']}`,
    );
    assert(
      includesText(publicResponse.body, 'Hello from drop.cv'),
      'Expected uploaded HTML to render on the public subdomain',
    );
  });

  await run('TEST 11: Premium user uploads a multi-file site bundle -> 201 and asset serving', async () => {
    const siteSlug = `multi-site-test-${suffix}`;
    const registration = await request('POST', '/api/auth/register', {
      email: `multi.site.${suffix}@test.drop.cv`,
      password: 'SitePass123!',
      plan: 'Premium',
      userType: 'professional',
      slug: siteSlug,
      professionalProfile: {
        fullName: 'Multi Site User',
        headline: 'Creative Developer',
      },
    });

    assertStatus(registration, 201, 'Register multi-file site user');

    const response = await uploadMultipart(
      '/api/sites/upload',
      [
        { type: 'field', fieldName: 'siteTitle', value: 'Multi File Portfolio' },
        { type: 'field', fieldName: 'style', value: 'bold editorial' },
        {
          type: 'file',
          fieldName: 'site',
          filename: 'index.html',
          content: '<!doctype html><html><head><meta charset="utf-8"><title>Multi File Portfolio</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Multi file site</h1><p>Hosted from separate files.</p><script src="app.js"></script></main></body></html>',
          mimetype: 'text/html',
        },
        {
          type: 'file',
          fieldName: 'site',
          filename: 'styles.css',
          content: 'body{font-family:Inter,system-ui,sans-serif;background:#fbf7f2;color:#1f2937;padding:48px} main{max-width:760px;margin:0 auto}',
          mimetype: 'text/css',
        },
        {
          type: 'file',
          fieldName: 'site',
          filename: 'app.js',
          content: "document.body.classList.add('multi-file-ready');",
          mimetype: 'application/javascript',
        },
      ],
      registration.cookies,
    );

    assert([200, 201].includes(response.status), `Expected 200 or 201, got ${response.status}`);
    assertField(response.body, 'deploymentId', 'Upload multi-file site');

    const publicResponse = await request('GET', '/', undefined, null, { 'x-slug': siteSlug });
    assertStatus(publicResponse, 200, 'Public multi-file site request');
    assert(
      includesText(publicResponse.body, 'Multi file site'),
      'Expected the public subdomain to render the uploaded multi-file site',
    );

    const cssResponse = await request('GET', '/styles.css', undefined, null, { 'x-slug': siteSlug });
    assertStatus(cssResponse, 200, 'Public CSS asset request');
    assert(
      includesText(cssResponse.headers?.['content-type'], 'text/css'),
      `Expected CSS content-type, got ${cssResponse.headers?.['content-type']}`,
    );
    assert(
      includesText(cssResponse.body, 'background:#fbf7f2'),
      'Expected uploaded CSS to be served from the site bundle',
    );
  });

  await run('TEST 12: Premium user uploads a ZIP site bundle -> 201 and public entrypoint', async () => {
    const siteSlug = `zip-site-test-${suffix}`;
    const registration = await request('POST', '/api/auth/register', {
      email: `zip.site.${suffix}@test.drop.cv`,
      password: 'SitePass123!',
      plan: 'Premium',
      userType: 'professional',
      slug: siteSlug,
      professionalProfile: {
        fullName: 'Zip Site User',
        headline: 'Product Designer',
      },
    });

    assertStatus(registration, 201, 'Register ZIP site user');

    const zipBuffer = await buildStaticSiteZip();
    const response = await uploadFile(
      '/api/sites/upload',
      'site',
      'portfolio.zip',
      zipBuffer,
      'application/zip',
      registration.cookies,
    );

    assert([200, 201].includes(response.status), `Expected 200 or 201, got ${response.status}`);
    assertField(response.body, 'deploymentId', 'Upload ZIP site');

    const publicResponse = await request('GET', '/', undefined, null, { 'x-slug': siteSlug });
    assertStatus(publicResponse, 200, 'Public ZIP site request');
    assert(
      includesText(publicResponse.body, 'Zip bundle site'),
      'Expected the public subdomain to render the uploaded ZIP site',
    );

    const assetResponse = await request('GET', '/app.js', undefined, null, { 'x-slug': siteSlug });
    assertStatus(assetResponse, 200, 'Public ZIP JS asset request');
    assert(
      includesText(assetResponse.headers?.['content-type'], 'application/javascript'),
      `Expected JS content-type, got ${assetResponse.headers?.['content-type']}`,
    );
    assert(
      includesText(assetResponse.body, 'data-zip-site'),
      'Expected uploaded JS to be served from the ZIP bundle',
    );
  });

  await run('TEST 13: Premium user uploads PDF + DOCX resume bundle -> 201 and generated site', async () => {
    const siteSlug = `resume-site-test-${suffix}`;
    const registration = await request('POST', '/api/auth/register', {
      email: `resume.site.${suffix}@test.drop.cv`,
      password: 'SitePass123!',
      plan: 'Premium',
      userType: 'professional',
      slug: siteSlug,
      professionalProfile: {
        fullName: 'Resume Site User',
        headline: 'Cardiologist',
      },
    });

    assertStatus(registration, 201, 'Register resume site user');

    const response = await uploadMultipart(
      '/api/sites/upload',
      [
        {
          type: 'file',
          fieldName: 'site',
          filename: 'resume.pdf',
          content: buildMinimalPdf('Dr. Leila Farhadi'),
          mimetype: 'application/pdf',
        },
        {
          type: 'file',
          fieldName: 'site',
          filename: 'resume.docx',
          content: buildMinimalDocx(),
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        { type: 'field', fieldName: 'fullName', value: 'Dr. Leila Farhadi' },
        { type: 'field', fieldName: 'headline', value: 'Senior Cardiologist' },
        { type: 'field', fieldName: 'siteTitle', value: 'Leila Farhadi CV' },
        { type: 'field', fieldName: 'summary', value: 'A premium resume site for a senior cardiologist.' },
      ],
      registration.cookies,
    );

    assert([200, 201].includes(response.status), `Expected 200 or 201, got ${response.status}`);
    assertField(response.body, 'deploymentId', 'Upload resume bundle');

    const publicResponse = await request('GET', '/', undefined, null, { 'x-slug': siteSlug });
    assertStatus(publicResponse, 200, 'Public resume site request');
    assert(
      includesText(publicResponse.headers?.['content-type'], 'text/html'),
      `Expected HTML content-type, got ${publicResponse.headers?.['content-type']}`,
    );
    assert(
      includesText(publicResponse.body, 'Leila Farhadi'),
      'Expected the generated resume site to include the uploaded name',
    );
  });

  await run('TEST 14: Upload story as Standard user -> 403', async () => {
    const response = await request(
      'POST',
      '/api/upload/story',
      { q1: 'I am a doctor', q2: 'Saved lives' },
      context.professionalCookie,
    );

    assertStatus(response, 403, 'Upload story as Standard user');
  });

  await run('TEST 15: Register Premium user and upload story -> 201', async () => {
    const premiumEmail = `premium.user.${suffix}@test.drop.cv`;
    const premiumSlug = `premium-user-test-${suffix}`;
    const registration = await request('POST', '/api/auth/register', {
      email: premiumEmail,
      password: 'PremiumPass123!',
      plan: 'Premium',
      userType: 'professional',
      slug: premiumSlug,
      professionalProfile: {
        fullName: 'Premium User',
        headline: 'Senior Architect',
        city: 'Paris',
        country: 'France',
        jobTitle: 'Principal Architect',
        industry: 'Architecture',
        yearsExperience: '10-15',
        seniority: 'Lead',
        skills: ['Architecture', 'Design', 'AutoCAD'],
      },
    });

    assertStatus(registration, 201, 'Register Premium user');
    context.premiumCookie = registration.cookies;

    const response = await request(
      'POST',
      '/api/upload/story',
      {
        q1: 'I am a principal architect with 15 years designing sustainable buildings across Europe',
        q2: 'Led the Paris Climate Center project worth 40M EUR, won EU Architecture Award 2022',
        q3: 'AutoCAD, Revit, sustainable design, project management, team leadership',
        q4: 'I combine technical excellence with environmental consciousness',
        q5: 'A partner role at a top European firm focused on green architecture',
        q6: 'Fluent in French, English, Spanish. Published in Architectural Review 2023.',
      },
      context.premiumCookie,
    );

    assert([200, 201].includes(response.status), `Expected 200 or 201, got ${response.status}`);
    assertField(response.body, 'deploymentId', 'Upload story as Premium user');

    context.storyDeploymentId = response.body.deploymentId;
  });

  await run('TEST 16: Upload story with missing required fields -> 400', async () => {
    const response = await request(
      'POST',
      '/api/upload/story',
      { q1: '', q2: '', q6: 'some extra info' },
      context.premiumCookie,
    );

    assertStatus(response, 400, 'Upload story with missing required fields');
    assert(
      includesText(response.body?.error, 'required') ||
        includesText(response.body?.error, 'q1') ||
        includesText(response.body?.error, 'q2'),
      'Expected required fields error',
    );
  });

  await run('TEST 17: Convert quota blocks the 6th CV upload -> 429', async () => {
    const limitEmail = `convert-limit.${suffix}@test.drop.cv`;
    const limitSlug = `convert-limit-${suffix}`;
    const registration = await request('POST', '/api/auth/register', {
      email: limitEmail,
      password: 'LimitPass123!',
      plan: 'Standard',
      userType: 'professional',
      slug: limitSlug,
      professionalProfile: {
        fullName: 'Convert Limit User',
        headline: 'Operations Lead',
      },
    });

    assertStatus(registration, 201, 'Register convert limit user');

    for (let index = 0; index < 5; index += 1) {
      const response = await uploadFile(
        '/api/upload/cv?mode=convert',
        'cv',
        `limit-${index}.docx`,
        buildMinimalDocx(),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        registration.cookies,
      );

      assert([200, 201].includes(response.status), `Expected 200 or 201, got ${response.status}`);
    }

    const blocked = await uploadFile(
      '/api/upload/cv?mode=convert',
      'cv',
      'limit-block.docx',
      buildMinimalDocx(),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      registration.cookies,
    );

    assertStatus(blocked, 429, '6th CV upload after monthly limit');
    assert(
      includesText(blocked.body?.error, 'limit') || includesText(blocked.body?.error, 'monthly'),
      'Expected a monthly limit error message',
    );
  });

  console.log(`Upload suite: ${passedCount}/${module.exports.expectedTests} tests passed`);
}

module.exports = uploadSuite;
module.exports.expectedTests = 17;

if (require.main === module) {
  const runner = createRunner();

  runner
    .runSuite('upload', uploadSuite, { crashFailureCount: module.exports.expectedTests })
    .then(() => runner.finalize())
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
