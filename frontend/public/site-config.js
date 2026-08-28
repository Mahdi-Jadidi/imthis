(function () {
  var host = (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
  var isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  if (!isLocalhost && typeof document !== 'undefined') {
    document.write('<script src="site-config.production.js"></script>');
  }

  window.dropCVConfig = window.dropCVConfig || {};
  window.dropCVConfig.trialDays = Number(window.dropCVConfig.trialDays) > 0
    ? Number(window.dropCVConfig.trialDays)
    : 3;
  window.dropCVConfig.apiBaseUrl = typeof window.dropCVConfig.apiBaseUrl === 'string'
    ? window.dropCVConfig.apiBaseUrl.trim().replace(/\/$/, '')
    : '';
  window.dropCVTrialDays = window.dropCVConfig.trialDays;
})();
