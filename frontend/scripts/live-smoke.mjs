import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildProductionSiteConfig,
  getSiteConfigLoaderMarker,
  LIVE_BACKEND_ORIGIN,
  LIVE_FRONTEND_API_BASE,
  LIVE_FRONTEND_ORIGIN,
  LIVE_PREFLIGHT_CASES,
  LIVE_REPO_CONFIG_FILES,
  resolveLiveUrl,
} from './live-targets.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const expectedConfig = normalizeText(buildProductionSiteConfig());
const expectedLoaderMarker = getSiteConfigLoaderMarker();
const timeoutMs = 20_000;

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function withTimeout(signalTimeoutMs = timeoutMs) {
  return AbortSignal.timeout(signalTimeoutMs);
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
    },
    signal: init.signal || withTimeout(),
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

  return { response, text, data };
}

function assertCors(response, label) {
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    LIVE_FRONTEND_ORIGIN,
    `${label} should allow the live frontend origin`,
  );
  assert.equal(
    response.headers.get('access-control-allow-credentials'),
    'true',
    `${label} should allow credentialed requests`,
  );
}

async function verifyRepoConfig(relativePath) {
  const filePath = join(repoRoot, relativePath);
  const actual = normalizeText(await readFile(filePath, 'utf8'));
  assert.ok(
    actual.includes(expectedLoaderMarker),
    `${relativePath} should load site-config.production.js outside localhost`,
  );
}

async function main() {
  for (const relativePath of LIVE_REPO_CONFIG_FILES) {
    await verifyRepoConfig(relativePath);
  }

  const home = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/'), {
    headers: { Accept: 'text/html' },
  });
  assert.equal(home.response.status, 200, 'GET / should load the live homepage');
  assert.ok(
    (home.response.headers.get('content-type') || '').includes('text/html'),
    'GET / should return HTML',
  );
  assert.ok(home.text.includes('<html'), 'GET / should contain HTML markup');

  const index = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/'), {
    headers: { Accept: 'text/html' },
  });
  assert.equal(index.response.status, 200, 'GET / should load the live homepage');
  assert.ok(index.text.includes('<html'), 'GET / should contain HTML markup');
  assert.ok(index.text.includes('im this site'), 'Homepage should show the new hero title');
  assert.ok(index.text.includes('domain-search-form'), 'Homepage should render domain search');

  const legacyIndex = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/index.html'), {
    redirect: 'manual',
    headers: { Accept: 'text/html' },
  });
  assert.equal(legacyIndex.response.status, 308, 'GET /index.html should permanently redirect to the clean URL');
  assert.equal(legacyIndex.response.headers.get('location'), '/', 'GET /index.html should redirect to /');

  const signup = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/signup'), {
    headers: { Accept: 'text/html' },
  });
  assert.equal(signup.response.status, 200, 'GET /signup should load');
  assert.ok(signup.text.includes('<form') || signup.text.includes('data-step="1"'), 'Signup page should render');

  const login = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/login'), {
    headers: { Accept: 'text/html' },
  });
  assert.equal(login.response.status, 200, 'GET /login should load');
  assert.ok(login.text.includes('<form'), 'Login page should render a form');
  assert.equal(login.text.includes('auth-copy'), false, 'Login page should not render the old promotional banner');

  for (const page of ['/dashboard', '/billing', '/admin']) {
    const result = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, page), {
      headers: { Accept: 'text/html' },
    });
    assert.equal(result.response.status, 200, `GET ${page} should load`);
    assert.ok(result.text.includes('<html'), `GET ${page} should contain HTML markup`);
  }

  const logo = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/logo.svg'), {
    headers: { Accept: 'image/svg+xml' },
  });
  assert.equal(logo.response.status, 200, 'GET /logo.svg should load');
  assert.ok(logo.text.includes('<svg'), 'GET /logo.svg should be an SVG asset');

  const siteConfig = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/site-config.js'), {
    headers: { Accept: 'application/javascript' },
  });
  assert.equal(siteConfig.response.status, 200, 'site-config.js should load');
  assert.ok(
    siteConfig.text.includes(expectedLoaderMarker),
    'Live site-config.js should load site-config.production.js outside localhost',
  );

  const productionSiteConfig = await request(resolveLiveUrl(LIVE_FRONTEND_ORIGIN, '/site-config.production.js'), {
    headers: { Accept: 'application/javascript' },
  });
  assert.equal(productionSiteConfig.response.status, 200, 'site-config.production.js should load');
  assert.equal(
    normalizeText(productionSiteConfig.text),
    expectedConfig,
    'Live site-config.production.js should match the shared frontend proxy base',
  );

  const health = await request(resolveLiveUrl(LIVE_BACKEND_ORIGIN, '/health'), {
    headers: { Accept: 'application/json' },
  });
  assert.equal(health.response.status, 200, 'GET /health should return 200');
  assert.equal(health.data?.status, 'ok', 'GET /health should report ok');

  const plans = await request(resolveLiveUrl(LIVE_BACKEND_ORIGIN, '/api/plans'), {
    headers: { Accept: 'application/json', Origin: LIVE_FRONTEND_ORIGIN },
  });
  assert.equal(plans.response.status, 200, 'GET /api/plans should return 200');
  assertCors(plans.response, '/api/plans');
  assert.equal(plans.data?.success, true, '/api/plans should succeed');
  assert.deepEqual(plans.data?.plans, { Annual: { amount: 710000, currency: 'IRT' } }, 'one annual plan should be present');

  const domainSearch = await request(resolveLiveUrl(LIVE_BACKEND_ORIGIN, '/api/auth/slug-availability?slug=admin'), {
    headers: { Accept: 'application/json', Origin: LIVE_FRONTEND_ORIGIN },
  });
  assert.equal(domainSearch.response.status, 200, 'GET /api/auth/slug-availability should return 200');
  assertCors(domainSearch.response, '/api/auth/slug-availability');
  assert.equal(domainSearch.data?.available, false, 'Reserved customer addresses should be unavailable');
  assert.ok(domainSearch.data?.suggestions?.length > 0, 'Unavailable addresses should return suggestions');

  const me = await request(resolveLiveUrl(LIVE_BACKEND_ORIGIN, '/api/auth/me'), {
    headers: { Accept: 'application/json', Origin: LIVE_FRONTEND_ORIGIN },
  });
  assert.equal(me.response.status, 401, 'GET /api/auth/me should reject unauthenticated requests');
  assertCors(me.response, '/api/auth/me');

  for (const { path, method, requestHeaders } of LIVE_PREFLIGHT_CASES) {
    const preflight = await request(resolveLiveUrl(LIVE_BACKEND_ORIGIN, path), {
      method: 'OPTIONS',
      headers: {
        Origin: LIVE_FRONTEND_ORIGIN,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': requestHeaders,
      },
    });

    assert.equal(preflight.response.status, 204, `OPTIONS ${path} should return 204`);
    assertCors(preflight.response, `OPTIONS ${path}`);
    assert.ok(
      (preflight.response.headers.get('access-control-allow-methods') || '').toUpperCase().includes(method),
      `OPTIONS ${path} should allow ${method}`,
    );
    assert.ok(
      (preflight.response.headers.get('access-control-allow-headers') || '').toLowerCase().includes(requestHeaders),
      `OPTIONS ${path} should allow ${requestHeaders}`,
    );
  }

  console.log('Live smoke checks passed: public pages, logo, config, health, plans, auth, and CORS preflight all look good.');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
