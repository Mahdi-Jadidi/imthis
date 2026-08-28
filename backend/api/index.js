let appPromise;
let readyPromise;

function getApp() {
  if (!appPromise) {
    const buildApp = require('../src/app');
    appPromise = buildApp({
      logger: true,
    });
    readyPromise = appPromise.then(async (app) => {
      await app.ready();
      return app;
    });
  }

  return readyPromise;
}

module.exports = async function vercelHandler(req, res) {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  const path = requestUrl.searchParams.get('path') || '';

  requestUrl.searchParams.delete('path');
  req.url = `/${path}${requestUrl.search}`;

  try {
    const app = await getApp();
    app.server.emit('request', req, res);
  } catch (error) {
    console.error('Backend startup failed', error);
    const message = error && error.message ? String(error.message) : '';
    const safeDetail = message.startsWith('Missing required environment variables:')
      ? message
      : undefined;
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'backend_startup_failed',
      code: error && error.code ? String(error.code) : 'UNKNOWN',
      name: error && error.name ? String(error.name) : 'Error',
      ...(safeDetail ? { detail: safeDetail } : {}),
    }));
  }
};
