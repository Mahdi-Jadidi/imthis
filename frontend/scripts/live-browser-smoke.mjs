import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import {
  LIVE_BACKEND_ORIGIN,
  LIVE_FRONTEND_API_BASE,
  LIVE_FRONTEND_ORIGIN,
  resolveLiveUrl,
} from './live-targets.mjs';

if (process.env.DROPCV_ALLOW_PRODUCTION_MUTATIONS !== 'true') {
  throw new Error('Refusing to create QA accounts on production. Run this only against staging or set DROPCV_ALLOW_PRODUCTION_MUTATIONS=true for an explicitly approved test run.');
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

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
});
const page = await context.newPage();
await page.addInitScript(() => {
  let apiValue;
  window.__dropcvApiAssignments = [];
  Object.defineProperty(window, 'dropCVApi', {
    configurable: true,
    get() {
      return apiValue;
    },
    set(nextValue) {
      apiValue = nextValue;
      window.__dropcvApiAssignments.push({
        type: typeof nextValue,
        keys: nextValue && typeof nextValue === 'object' ? Object.keys(nextValue) : [],
      });
    },
  });
});
const pageErrors = [];
const consoleErrors = [];
const apiResponses = [];
const assetResponses = [];
const requestFailures = [];
const navigations = [];
const runId = Date.now().toString(36);
const slug = `qa-smoke-${runId}`;
const email = `${slug}@test.imthis.site`;
const password = 'Password123!';
const fullName = 'QA Smoke Tester';

page.on('pageerror', (error) => {
  pageErrors.push(error.message);
});

page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
    consoleErrors.push(message.text());
  }
});

page.on('response', async (response) => {
  if (response.url().includes('/proxy/api/')) {
    let summary = null;
    if (/\/api\/(?:auth|users)\/me$/.test(new URL(response.url()).pathname)) {
      try {
        const data = await response.json();
        summary = data?.user ? { email: data.user.email, plan: data.user.plan } : data;
      } catch {}
    }
    apiResponses.push({ url: response.url(), status: response.status(), summary });
  }
  if (/\/(?:dropcv-auth|dashboard-real-data|dropcv-api|site-config(?:\.production)?)\.js(?:\?|$)/.test(response.url())) {
    assetResponses.push({ url: response.url(), status: response.status() });
  }
});

page.on('requestfailed', (request) => {
  requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'failed' });
});

page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) {
    navigations.push(frame.url());
  }
});

async function waitForAuthenticatedDashboard(expectedEmail, label) {
  try {
    await page.waitForFunction(
      (emailAddress) => window.currentUser?.email === emailAddress,
      expectedEmail,
      { timeout: 20000 },
    );
  } catch (error) {
    const pageState = await page.evaluate(() => ({
      readyState: document.readyState,
      currentUser: window.currentUser || null,
      apiType: typeof window.dropCVApi,
      apiMethods: window.dropCVApi ? Object.keys(window.dropCVApi) : [],
      authType: typeof window.dropCV,
      authMethods: window.dropCV ? Object.keys(window.dropCV) : [],
      dashboardInitialized: Boolean(window.__dropcvSharedDashboardInitialized),
      contentClass: document.getElementById('dashboardContent')?.className || '',
      apiAssignments: window.__dropcvApiAssignments || [],
    }));
    console.error(`${label} auth trace: ${JSON.stringify({
      url: page.url(),
      pageState,
      apiResponses: apiResponses.slice(-30),
      assetResponses: assetResponses.slice(-30),
      requestFailures: requestFailures.slice(-30),
      navigations: navigations.slice(-30),
      pageErrors,
      consoleErrors,
    })}`);
    throw error;
  }
}

async function expectNoRuntimeErrors(label) {
  assert.equal(pageErrors.length, 0, `${label} should not throw a page error: ${pageErrors.join(' | ')}`);

  if (consoleErrors.length > 0) {
    console.log(`${label} logged console errors: ${consoleErrors.join(' | ')}`);
  }
}

async function waitForFrontendBoot(pageInstance) {
  await pageInstance.waitForFunction(
    (expectedApiBase) => window.dropCVConfig && window.dropCVConfig.apiBaseUrl === expectedApiBase,
    LIVE_FRONTEND_API_BASE,
  );
  await pageInstance.waitForFunction(() => {
    const amount =
      document.querySelector('[data-dropcv-plan-amount="Annual"]');
    return amount && !/loading price/i.test(amount.textContent || '');
  });
  await pageInstance.waitForTimeout(1000);
}

try {
  await page.goto(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/'), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[href="signup.html"]');
  await waitForFrontendBoot(page);
  await expectNoRuntimeErrors('Homepage');

  const homeConfig = await page.evaluate(() => window.dropCVConfig?.apiBaseUrl || '');
  assert.equal(homeConfig, LIVE_FRONTEND_API_BASE, 'Homepage should point at the live frontend proxy base');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('a[href="signup.html"]').first().click(),
  ]);
  assert.ok(page.url().includes('/signup.html'), 'Signup link should navigate to the signup page');
  await page.waitForSelector('section[data-step="1"] button[data-plan="Annual"]');
  await waitForFrontendBoot(page);
  await page.locator('section[data-step="1"] button[data-plan="Annual"]').click();
  await page.locator('section[data-step="1"] button[data-next]').click();
  await page.waitForSelector('#fullName');
  await expectNoRuntimeErrors('Signup step 2');

  await page.locator('#fullName').fill(fullName);
  await page.locator('#slug').fill(slug);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#passwordToggle').click();
  assert.equal(await page.locator('#password').getAttribute('type'), 'text', 'Password toggle should reveal the password');
  await page.locator('#passwordToggle').click();
  assert.equal(await page.locator('#password').getAttribute('type'), 'password', 'Password toggle should hide the password again');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('a[href="login.html"]').first().click(),
  ]);
  assert.ok(page.url().includes('/login.html'), 'Login link should navigate to the login page');
  await page.waitForSelector('#form');
  await page.waitForFunction(
    (expectedApiBase) => window.dropCVConfig && window.dropCVConfig.apiBaseUrl === expectedApiBase,
    LIVE_FRONTEND_API_BASE,
  );
  await page.locator('#email').fill('qa-smoke@example.com');
  await page.locator('#password').fill('Password123!');
  const loginPageText = await page.locator('body').innerText();
  assert.ok(
    !/magic\s*link|passwordless|email me a link|send me a link/i.test(loginPageText),
    'Login page should not advertise a magic-link flow',
  );
  assert.equal(await page.locator('input[type="password"]').count(), 1, 'Login page should require a password field');
  await expectNoRuntimeErrors('Login page');

  await page.goto(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/signup.html'), {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await waitForFrontendBoot(page);
  await page.waitForSelector('section[data-step="1"] button[data-plan="Annual"]');
  await page.locator('section[data-step="1"] button[data-plan="Annual"]').click();
  await page.locator('section[data-step="1"] button[data-next]').click();
  await page.waitForSelector('#registerBtn');
  await page.locator('#fullName').fill(fullName);
  await page.locator('#slug').fill(slug);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);

  await Promise.all([
    page.waitForURL('**/dashboard.html', { waitUntil: 'domcontentloaded', timeout: 60000 }),
    page.locator('#registerBtn').click(),
  ]);
  assert.ok(page.url().includes('/dashboard.html'), 'Signup should redirect to the shared dashboard');
  await page.waitForSelector('#logout');
  await waitForAuthenticatedDashboard(email, 'Signup dashboard');
  await page.waitForTimeout(8000);
  assert.ok(
    page.url().includes('/dashboard.html'),
    'Signup session should remain on the dashboard after authentication settles',
  );

  await page.locator('.nav[data-section="site"]').click();
  assert.equal(
    await page.locator('#premium-brief:visible').count(),
    1,
    'My Site should show the flexible team-build brief',
  );
  assert.equal(
    await page.locator('#premium-brief input[name="resume"]').getAttribute('required'),
    null,
    'The resume should be optional',
  );
  assert.equal(await page.locator('#premium-brief input[name="attachments"]').getAttribute('multiple'), '', 'Portfolio attachments should allow multiple files');

  assert.equal(
    await page.locator('.nav[data-section="link"]').isHidden(),
    true,
    'Public Link should stay hidden until the first site exists',
  );
  assert.equal(
    await page.locator('.nav[data-section="analytics"]').isHidden(),
    true,
    'Analytics should stay hidden until the first site exists',
  );
  await page.locator('.nav[data-section="settings"]').click();
  assert.equal(await page.locator('#settings-form input[name="email"]').inputValue(), email, 'Settings should show the authenticated email');
  assert.equal(await page.locator('#settings-form input[name="email"]').isDisabled(), true, 'Email should remain read-only outside the verified change flow');
  assert.equal(await page.locator('#settings-form input[name="fullName"]').isEnabled(), true, 'Professional name should be editable');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
    page.locator('#logout').click(),
  ]);

  await page.goto(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/login.html'), {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForSelector('#form');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);

  await Promise.all([
    page.waitForURL('**/dashboard.html', { waitUntil: 'domcontentloaded', timeout: 60000 }),
    page.locator('#submit').click(),
  ]);
  assert.ok(page.url().includes('/dashboard.html'), 'Login should redirect to the shared dashboard');
  await waitForAuthenticatedDashboard(email, 'Login dashboard');
  await page.waitForTimeout(8000);
  assert.ok(
    page.url().includes('/dashboard.html'),
    'Login session should remain on the dashboard after authentication settles',
  );

  console.log('Live browser smoke passed: homepage, signup, and login remained authenticated on the dashboard.');
} finally {
  await context.close();
  await browser.close();
}
