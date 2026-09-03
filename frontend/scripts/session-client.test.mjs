import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/dropcv-api.js', import.meta.url), 'utf8');

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
  };
}

function createClient(fetchImpl) {
  const events = [];
  const window = {
    dropCVConfig: { apiBaseUrl: '' },
    location: { hostname: 'imthis.site', pathname: '/dashboard' },
    dispatchEvent(event) { events.push(event.type); },
    __dropcvPendingRequests: 0,
  };
  const context = vm.createContext({
    window,
    fetch: fetchImpl,
    FormData,
    Blob,
    File: globalThis.File,
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
    encodeURIComponent,
    document: { referrer: '' },
    navigator: { userAgent: 'test' },
  });
  vm.runInContext(source, context, { filename: 'dropcv-api.js' });
  return { api: window.dropCVApi, events };
}

test('concurrent protected 401 responses share one refresh and then retry', async () => {
  let refreshCalls = 0;
  const protectedCalls = new Map();
  const { api } = createClient(async (_url, options) => {
    const path = String(_url);
    if (path === '/api/auth/refresh') {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return response(200, { success: true });
    }
    const count = (protectedCalls.get(path) || 0) + 1;
    protectedCalls.set(path, count);
    return count === 1
      ? response(401, { error: 'Unauthorized' })
      : response(200, { success: true, method: options.method });
  });

  const results = await Promise.all([
    api.getMe(),
    api.getMySites(),
    api.getMySiteRequests(),
  ]);

  assert.equal(refreshCalls, 1);
  assert(results.every((result) => result.ok));
  assert.deepEqual([...protectedCalls.values()], [2, 2, 2]);
});

test('login never logs out the existing session before credentials succeed', async () => {
  const paths = [];
  const { api } = createClient(async (url) => {
    paths.push(String(url));
    return response(401, { error: 'Invalid credentials' });
  });

  const result = await api.login('person@example.com', 'wrong-password');
  assert.equal(result.status, 401);
  assert.deepEqual(paths, ['/api/auth/login']);
});

test('auth me participates in session recovery without refreshing auth actions', async () => {
  let meCalls = 0;
  let refreshCalls = 0;
  const { api } = createClient(async (url) => {
    if (String(url) === '/api/auth/refresh') {
      refreshCalls += 1;
      return response(200, { success: true });
    }
    meCalls += 1;
    return meCalls === 1
      ? response(401, { error: 'Unauthorized' })
      : response(200, { success: true, user: { id: 'user-1' } });
  });

  const result = await api.getAuthSession();
  assert.equal(result.ok, true);
  assert.equal(refreshCalls, 1);
  assert.equal(meCalls, 2);
});

test('failed refresh emits one session-expired event', async () => {
  const { api, events } = createClient(async (url) => {
    return String(url) === '/api/auth/refresh'
      ? response(401, { error: 'Unauthorized' })
      : response(401, { error: 'Unauthorized' });
  });

  await Promise.all([api.getMe(), api.getMySites()]);
  assert.equal(events.filter((name) => name === 'dropcv:session-expired').length, 1);
});
