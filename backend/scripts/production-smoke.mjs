import assert from 'node:assert/strict';

const origin = process.env.IMTHIS_BACKEND_ORIGIN || 'https://drop-cv-backend.vercel.app';
const frontendOrigin = process.env.IMTHIS_FRONTEND_ORIGIN || 'https://dropcv-frontend.vercel.app';

async function request(path, init = {}) {
  const response = await fetch(new URL(path, origin), {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function assertCors(response, label) {
  assert.equal(response.headers.get('access-control-allow-origin'), frontendOrigin, `${label} should allow the frontend`);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true', `${label} should allow credentials`);
}

const health = await request('/health');
assert.equal(health.response.status, 200, 'health should return 200');
assert.equal(health.body?.status, 'ok', 'health should report ok');

const plans = await request('/api/plans', { headers: { Origin: frontendOrigin } });
assert.equal(plans.response.status, 200, 'plans should return 200');
assert.equal(plans.body?.success, true, 'plans should report success');
assert.deepEqual(plans.body?.plans, { Annual: { amount: 710000, currency: 'IRT' } }, 'one annual plan should exist');
assertCors(plans.response, 'plans');

const domainSearch = await request('/api/auth/slug-availability?slug=admin', { headers: { Origin: frontendOrigin } });
assert.equal(domainSearch.response.status, 200, 'domain search should return 200');
assert.equal(domainSearch.body?.available, false, 'reserved names should be unavailable');
assert.ok(Array.isArray(domainSearch.body?.suggestions) && domainSearch.body.suggestions.length > 0, 'domain search should suggest alternatives');
assertCors(domainSearch.response, 'domain search');

for (const path of ['/api/auth/me', '/api/users/me', '/api/admin/overview', '/api/internal/lifecycle']) {
  const result = await request(path, { headers: { Origin: frontendOrigin } });
  assert.equal(result.response.status, 401, `${path} should reject an anonymous request`);
  assertCors(result.response, path);
}

console.log('Production backend smoke checks passed: health, plans, CORS, and protected endpoints.');
