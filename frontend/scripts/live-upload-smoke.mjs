import assert from 'node:assert/strict';
import { Buffer, File } from 'node:buffer';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import JSZip from 'jszip';
import {
  LIVE_BACKEND_ORIGIN,
  LIVE_FRONTEND_API_BASE,
  LIVE_FRONTEND_ORIGIN,
  resolveLiveUrl,
} from './live-targets.mjs';

if (process.env.DROPCV_ALLOW_PRODUCTION_MUTATIONS !== 'true') {
  throw new Error('Refusing to create QA accounts or uploads on production. Run this only against staging or set DROPCV_ALLOW_PRODUCTION_MUTATIONS=true for an explicitly approved test run.');
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const executablePath = findBrowserExecutable();
    if (executablePath) {
      return chromium.launch({ headless: true, executablePath });
    }

    throw error;
  }
}

function makeTextFile(name, mimeType, content) {
  return {
    name,
    mimeType,
    buffer: Buffer.from(content, 'utf8'),
  };
}

async function buildZipBuffer() {
  const zip = new JSZip();

  zip.file(
    'portfolio/index.html',
    '<!doctype html><html><head><meta charset="utf-8"><title>Zip QA</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Zip QA</h1><p data-marker="zip-root">Uploaded from a ZIP bundle.</p><script src="app.js"></script></main></body></html>',
  );
  zip.file(
    'portfolio/styles.css',
    'body{font-family:Inter,system-ui,sans-serif;background:#fefce8;color:#0f172a;padding:40px} main{max-width:720px;margin:0 auto}',
  );
  zip.file(
    'portfolio/app.js',
    "document.body.dataset.zipUpload = 'ready';",
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function fetchWithRetry(api, url, validate, label, attempts = 8, delayMs = 1000) {
  let lastResponse = null;
  let lastBody = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResponse = await api.get(url, { timeout: 5000 });
    lastBody = await lastResponse.text();

    if (validate(lastResponse, lastBody)) {
      return { response: lastResponse, body: lastBody };
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `${label} did not match expectations after ${attempts} attempts. Last status: ${lastResponse?.status()}. Last body start: ${lastBody.slice(0, 200)}`,
  );
}

async function fetchUrlWithRetry(api, url, validate, label, attempts = 8, delayMs = 1000) {
  let lastResponse = null;
  let lastBody = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResponse = await api.get(url, { timeout: 5000 });
    lastBody = await lastResponse.text();

    if (validate(lastResponse, lastBody)) {
      return { response: lastResponse, body: lastBody };
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `${label} did not match expectations after ${attempts} attempts. Last status: ${lastResponse?.status()}. Last body start: ${lastBody.slice(0, 200)}`,
  );
}

async function waitForFrontendBoot(page) {
  await page.waitForFunction(
    (expectedApiBase) =>
      Boolean(window.dropCVConfig?.apiBaseUrl === expectedApiBase && window.dropCVApi?.register && window.dropCVApi?.getMe),
    LIVE_FRONTEND_API_BASE,
  );
}

async function registerUserFromSignupPage(page, userSpec) {
  return page.evaluate(async (payload) => {
    return window.dropCVApi.register(payload);
  }, userSpec);
}

async function getAuthCookieHeader(context) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const cookies = await context.cookies([LIVE_FRONTEND_ORIGIN, LIVE_BACKEND_ORIGIN]);
    const authCookie = cookies.find((cookie) => cookie.name === 'dropcv_token');

    if (authCookie?.value) {
      return `dropcv_token=${authCookie.value}`;
    }

    if (attempt < 10) {
      await sleep(250);
    }
  }

  throw new Error('Expected dropcv_token to be set after signup');
}

async function fetchAuthenticatedUser(cookieHeader) {
  const response = await fetch(resolveLiveUrl(LIVE_BACKEND_ORIGIN, '/api/users/me'), {
    headers: {
      Accept: 'application/json',
      cookie: cookieHeader,
    },
  });
  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function buildUploadForm(caseSpec) {
  const form = new FormData();

  for (const file of caseSpec.files) {
    form.append('site', new File([file.buffer], file.name, { type: file.mimeType }));
  }

  Object.entries(caseSpec.fields || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      form.append(key, value.join(', '));
      return;
    }

    form.append(key, String(value));
  });

  return form;
}

async function uploadCaseViaApi(cookieHeader, caseSpec) {
  const response = await fetch(resolveLiveUrl(LIVE_BACKEND_ORIGIN, '/api/sites/upload'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      cookie: cookieHeader,
    },
    body: buildUploadForm(caseSpec),
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  assert.equal(response.status, 201, `${caseSpec.name} should return 201`);
  assert.ok(data?.deploymentId, `${caseSpec.name} should include a deploymentId`);
  assert.equal(data?.status, 'live', `${caseSpec.name} should be live immediately`);
  assert.equal(data?.fileCount, caseSpec.expectedFileCount, `${caseSpec.name} file count should match`);
  assert.equal(data?.entryPoint, caseSpec.expectedEntryPoint, `${caseSpec.name} entry point should match`);
  assert.equal(data?.method, 'files', `${caseSpec.name} should be stored as files`);

  return data;
}

async function verifyPublicSite(api, publicUrl, caseSpec) {
  assert.ok(publicUrl, `${caseSpec.name} should expose a public URL`);

  const rootUrl = publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`;
  const rootCheck = await fetchUrlWithRetry(
    api,
    rootUrl,
    (response, body) =>
      response.status() === 200 &&
      String(response.headers()['content-type'] || '').includes('text/html') &&
      body.includes(caseSpec.rootMarker),
    `${caseSpec.name} public root`,
  );

  assert.ok(rootCheck.body.includes(caseSpec.rootMarker), `${caseSpec.name} public root should include the root marker`);

  for (const asset of caseSpec.assetChecks || []) {
    const assetUrl = new URL(asset.path.replace(/^\//, ''), rootUrl).toString();
    const assetCheck = await fetchUrlWithRetry(
      api,
      assetUrl,
      (response, body) =>
        response.status() === 200 &&
        String(response.headers()['content-type'] || '').includes(asset.contentTypeFragment) &&
        body.includes(asset.marker),
      `${caseSpec.name} asset ${asset.path}`,
    );

    assert.ok(assetCheck.body.includes(asset.marker), `${caseSpec.name} asset ${asset.path} should include its marker`);
  }
}

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
});
const page = await context.newPage();
const api = context.request;

try {
  const runId = Date.now().toString(36);
  const slug = `qa-upload-${runId}`;
  const email = `${slug}@test.imthis.site`;
  const password = 'QaUpload123!';
  const fullName = 'QA Upload Tester';

  await page.goto(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/signup.html'), {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await waitForFrontendBoot(page);
  await page.waitForSelector('form, section[data-step="1"]');

  const registration = await registerUserFromSignupPage(page, {
    fullName,
    slug,
    email,
    password,
    plan: 'Annual',
    userType: 'professional',
    professionalProfile: {
      fullName,
      isPublic: false,
    },
  });

  assert.ok(registration.ok, `Signup should succeed: ${registration.error || registration.status}`);
  assert.equal(registration.status, 201, 'Signup should return 201');
  assert.equal(registration.data?.user?.email, email, 'Signup should store the email in the DB');
  assert.equal(registration.data?.user?.slug, slug, 'Signup should store the slug in the DB');
  assert.equal(registration.data?.user?.plan, 'Annual', 'Signup should use the single annual entitlement');

  const cookieHeader = await getAuthCookieHeader(context);
  const meAfterSignup = await fetchAuthenticatedUser(cookieHeader);

  assert.ok(meAfterSignup.ok, 'Signup should allow fetching the current user');
  assert.equal(meAfterSignup.data?.user?.email, email, 'Current user should match the signup email');
  assert.equal(meAfterSignup.data?.user?.slug, slug, 'Current user should match the signup slug');
  assert.equal(meAfterSignup.data?.user?.latestDeployment ?? null, null, 'Fresh signup should not have a deployment yet');
  assert.ok(
    ['trial', 'active'].includes(meAfterSignup.data?.user?.subscription?.status),
    `Signup should leave the account in trial or active state, got ${meAfterSignup.data?.user?.subscription?.status}`,
  );
  assert.ok(
    meAfterSignup.data?.user?.publicUrl,
    'Signup should create a public URL for the new account',
  );

  console.log(
    `Signed up user plan: ${meAfterSignup.data?.user?.plan || '(missing)'}, subscription: ${meAfterSignup.data?.user?.subscription?.status || '(missing)'}`,
  );
  console.log(`Public URL after signup: ${meAfterSignup.data?.user?.publicUrl}`);

  const singleHtmlDeployment = await uploadCaseViaApi(cookieHeader, {
    name: 'Single HTML upload',
    files: [
      makeTextFile(
        'index.html',
        'text/html',
        '<!doctype html><html><head><meta charset="utf-8"><title>Single HTML QA</title></head><body><main><h1>Single HTML QA</h1><p data-marker="single-html">This page came from one HTML file.</p></main></body></html>',
      ),
    ],
    fields: {
      siteTitle: 'Single HTML QA',
      style: 'minimal',
      summary: 'Single HTML file upload smoke test',
      ctaText: 'Hire me',
      palette: '#0F6E56, #111827, #F8FAFC',
      notes: 'Single-file HTML upload verification',
    },
    expectedFileCount: 1,
    expectedEntryPoint: 'index.html',
    rootMarker: 'Single HTML QA',
    assetChecks: [],
  });

  let meAfterUpload = await fetchAuthenticatedUser(cookieHeader);
  assert.equal(
    meAfterUpload.data?.user?.latestDeployment?.id,
    singleHtmlDeployment.deploymentId,
    'Single HTML upload should update latestDeployment in the DB',
  );
  assert.equal(
    meAfterUpload.data?.user?.latestDeployment?.status,
    'live',
    'Single HTML latest deployment should be live',
  );
  await verifyPublicSite(api, meAfterUpload.data?.user?.publicUrl, {
    name: 'Single HTML upload',
    rootMarker: 'Single HTML QA',
    assetChecks: [],
  });

  const multiFileDeployment = await uploadCaseViaApi(cookieHeader, {
    name: 'Three-file upload',
    files: [
      makeTextFile(
        'index.html',
        'text/html',
        '<!doctype html><html><head><meta charset="utf-8"><title>Multi File QA</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Multi File QA</h1><p id="multi-marker">Three separate files.</p><script src="app.js"></script></main></body></html>',
      ),
      makeTextFile(
        'styles.css',
        'text/css',
        'body{font-family:Inter,system-ui,sans-serif;background:#f7fbf9;color:#0f172a;padding:40px} main{max-width:760px;margin:0 auto}',
      ),
      makeTextFile(
        'app.js',
        'application/javascript',
        "document.body.dataset.multiFileUpload = 'ready';",
      ),
    ],
    fields: {
      siteTitle: 'Multi File QA',
      style: 'editorial',
      summary: 'Three-file HTML/CSS/JS site upload smoke test',
      ctaText: 'Contact me',
      palette: '#0F6E56, #1F2937, #FBF7F2',
      notes: 'Three-file upload verification',
    },
    expectedFileCount: 3,
    expectedEntryPoint: 'index.html',
    rootMarker: 'Multi File QA',
    assetChecks: [
      {
        path: '/styles.css',
        contentTypeFragment: 'text/css',
        marker: 'background:#f7fbf9',
      },
      {
        path: '/app.js',
        contentTypeFragment: 'javascript',
        marker: 'multiFileUpload',
      },
    ],
  });

  meAfterUpload = await fetchAuthenticatedUser(cookieHeader);
  assert.equal(
    meAfterUpload.data?.user?.latestDeployment?.id,
    multiFileDeployment.deploymentId,
    'Three-file upload should update latestDeployment in the DB',
  );
  assert.equal(
    meAfterUpload.data?.user?.latestDeployment?.status,
    'live',
    'Three-file latest deployment should be live',
  );
  await verifyPublicSite(api, meAfterUpload.data?.user?.publicUrl, {
    name: 'Three-file upload',
    rootMarker: 'Multi File QA',
    assetChecks: [
      {
        path: '/styles.css',
        contentTypeFragment: 'text/css',
        marker: 'background:#f7fbf9',
      },
      {
        path: '/app.js',
        contentTypeFragment: 'javascript',
        marker: 'multiFileUpload',
      },
    ],
  });

  const zipBuffer = await buildZipBuffer();
  const zipDeployment = await uploadCaseViaApi(cookieHeader, {
    name: 'ZIP upload',
    files: [
      {
        name: 'portfolio.zip',
        mimeType: 'application/zip',
        buffer: zipBuffer,
      },
    ],
    fields: {
      siteTitle: 'ZIP QA',
      style: 'bold',
      summary: 'ZIP bundle upload smoke test',
      ctaText: "Let's talk",
      palette: '#0F6E56, #0F172A, #FEFCE8',
      notes: 'ZIP upload verification',
    },
    expectedFileCount: 3,
    expectedEntryPoint: 'index.html',
    rootMarker: 'Zip QA',
    assetChecks: [
      {
        path: '/app.js',
        contentTypeFragment: 'javascript',
        marker: 'zipUpload',
      },
      {
        path: '/styles.css',
        contentTypeFragment: 'text/css',
        marker: 'background:#fefce8',
      },
    ],
  });

  meAfterUpload = await fetchAuthenticatedUser(cookieHeader);
  assert.equal(
    meAfterUpload.data?.user?.latestDeployment?.id,
    zipDeployment.deploymentId,
    'ZIP upload should update latestDeployment in the DB',
  );
  assert.equal(
    meAfterUpload.data?.user?.latestDeployment?.status,
    'live',
    'ZIP latest deployment should be live',
  );
  await verifyPublicSite(api, meAfterUpload.data?.user?.publicUrl, {
    name: 'ZIP upload',
    rootMarker: 'Zip QA',
    assetChecks: [
      {
        path: '/app.js',
        contentTypeFragment: 'javascript',
        marker: 'zipUpload',
      },
      {
        path: '/styles.css',
        contentTypeFragment: 'text/css',
        marker: 'background:#fefce8',
      },
    ],
  });

  console.log(
    [
      'Live signup and upload smoke passed.',
      `User: ${email}`,
      `Single HTML deployment: ${singleHtmlDeployment.deploymentId}`,
      `Three-file deployment: ${multiFileDeployment.deploymentId}`,
      `ZIP deployment: ${zipDeployment.deploymentId}`,
    ].join('\n'),
  );
} finally {
  await context.close();
  await browser.close();
}
