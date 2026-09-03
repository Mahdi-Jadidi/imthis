const API_BASE = (() => {
  const configured = window.dropCVConfig && typeof window.dropCVConfig.apiBaseUrl === 'string'
    ? window.dropCVConfig.apiBaseUrl.trim().replace(/\/$/, '')
    : '';

  if (configured) {
    return configured;
  }

  const host = window.location.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return '';
  }

  return '';
})();

let currentUserRequest = null;
let sessionRefreshRequest = null;
let sessionExpiredNotified = false;

function canRefreshSession(path) {
  const normalized = String(path || '');
  return normalized === '/api/auth/me' || !normalized.startsWith('/api/auth/');
}

function notifySessionExpired() {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  window.dispatchEvent(new CustomEvent('dropcv:session-expired'));
}

window.dropCVApi = {
  // Core request method
  async request(method, path, body = null, isFormData = false, skipSessionRefresh = false) {
    window.__dropcvPendingRequests = Number(window.__dropcvPendingRequests || 0) + 1;
    window.dispatchEvent(new Event('dropcv:request-start'));
    const options = {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: {},
    };

    if (body && !isFormData) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    if (body && isFormData) {
      options.body = body;
    }

    try {
      const res = await fetch(API_BASE + path, options);
      const data = await res.json().catch(() => null);

      const result = {
        ok: res.ok,
        status: res.status,
        data,
        error: !res.ok ? (data?.error || 'Request failed') : null,
      };

      if (result.status === 401 && !skipSessionRefresh && canRefreshSession(path)) {
        const refreshed = await this.refreshSession();
        if (refreshed.ok) {
          return this.request(method, path, body, isFormData, true);
        }
        notifySessionExpired();
      }

      return result;
    } catch (err) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: 'Network error — is the server running?',
      };
    } finally {
      window.__dropcvPendingRequests = Math.max(0, Number(window.__dropcvPendingRequests || 1) - 1);
      window.dispatchEvent(new Event('dropcv:request-end'));
    }
  },

  // Auth
  async getMe() {
    return this.request('GET', '/api/users/me');
  },
  async getAuthSession() {
    return this.request('GET', '/api/auth/me');
  },
  async login(email, password) {
    const result = await this.request('POST', '/api/auth/login', { email, password }, false, true);
    if (result.ok) sessionExpiredNotified = false;
    return result;
  },
  async register(payload) {
    return this.request('POST', '/api/auth/register', payload);
  },
  async logout() {
    const result = await this.request('POST', '/api/auth/logout', null, false, true);
    sessionExpiredNotified = false;
    return result;
  },
  async refreshSession() {
    if (sessionRefreshRequest) return sessionRefreshRequest;
    sessionRefreshRequest = this.request('POST', '/api/auth/refresh', null, false, true);
    try {
      const result = await sessionRefreshRequest;
      if (result.ok) sessionExpiredNotified = false;
      return result;
    } finally {
      sessionRefreshRequest = null;
    }
  },
  async getPlans() {
    return this.request('GET', '/api/plans');
  },

  // Upload
  async uploadCV(file, options = {}) {
    const form = new FormData();
    form.append('cv', file);
    const mode = String(options.mode || 'convert').toLowerCase() === 'regenerate' ? 'regenerate' : 'convert';
    return this.request('POST', `/api/upload/cv?mode=${encodeURIComponent(mode)}`, form, true);
  },
  async uploadStory(storyData, options = {}) {
    const mode = String(options.mode || 'convert').toLowerCase() === 'regenerate' ? 'regenerate' : 'convert';
    return this.request('POST', `/api/upload/story?mode=${encodeURIComponent(mode)}`, storyData);
  },
  async uploadSite(input, extraFields = {}) {
    const form = new FormData();

    let files = [];
    let fields = extraFields || {};

    if (input && typeof input === 'object' && !Array.isArray(input) && !(typeof File !== 'undefined' && input instanceof File) && !(typeof Blob !== 'undefined' && input instanceof Blob)) {
      if (input.file) {
        files = [input.file];
      } else if (input.files) {
        files = Array.from(input.files);
      }

      if (input.fields && typeof input.fields === 'object') {
        fields = input.fields;
      } else if (Object.keys(extraFields || {}).length === 0) {
        fields = input.fields || {};
      }
    } else if (Array.isArray(input)) {
      files = input;
    } else if (input) {
      files = [input];
    }

    files.filter(Boolean).forEach((file) => {
      form.append('site', file, file?.name || undefined);
    });

    Object.entries(fields || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }

      if (Array.isArray(value)) {
        form.append(key, value.join(', '));
        return;
      }

      form.append(key, String(value));
    });

    return this.request('POST', '/api/sites/upload', form, true);
  },
  async getDeploymentStatus(deploymentId) {
    return this.request('GET', `/api/upload/status/${deploymentId}`);
  },
  async getPreview(deploymentId) {
    return this.request('GET', `/api/preview/${deploymentId}`);
  },
  async updatePreview(deploymentId, data) {
    return this.request('PATCH', `/api/preview/${deploymentId}`, data);
  },
  async requestPayment(plan) {
    return this.request('POST', '/api/payments/request', { plan });
  },
  async getPendingManualPayment() {
    return this.request('GET', '/api/payments/pending-manual');
  },
  async getPaymentHistory() {
    return this.request('GET', '/api/payments/history');
  },
  async updateSettings(settings) {
    return this.request('PATCH', '/api/users/settings', settings);
  },
  async changePassword(currentPassword, newPassword) {
    return this.request('POST', '/api/users/password', { currentPassword, newPassword });
  },
  async requestEmailChange(newEmail) {
    return this.request('POST', '/api/users/email-change', { newEmail });
  },
  async deleteAccount(password) {
    return this.request('DELETE', '/api/users/account', { password, confirmation: 'DELETE' });
  },
  async unpublishSite(deploymentId) {
    return this.request('POST', `/api/sites/${deploymentId}/unpublish`);
  },
  async publishSite(deploymentId) {
    return this.request('POST', `/api/sites/${deploymentId}/publish`);
  },
  async getConversionUsage() {
    return this.request('GET', '/api/users/conversion-usage');
  },

  // Analytics
  async trackPageView(domainSlug) {
    return this.request('POST', '/api/analytics/track', {
      domainSlug,
      referrer: document.referrer || '',
      userAgent: navigator.userAgent,
    });
  },
  async getContextSlug() {
    const host = window.location.hostname || '';
    const hostMatch = host.match(/^([a-z0-9\-]+)\.drop\.cv$/i);
    if (hostMatch) {
      return hostMatch[1];
    }

    const pathMatch = window.location.pathname.match(/^\/site\/([a-z0-9-]+)(?:\/|$)/i);
    return pathMatch ? pathMatch[1] : null;
  },
  async trackVisitFromContext() {
    const slug = await this.getContextSlug();
    if (!slug) {
      return { ok: true, skipped: true };
    }

    return this.trackPageView(slug);
  },
  async getAnalyticsDashboard() {
    return this.request('GET', '/api/analytics/dashboard');
  },

  // Auth state helper
  async getCurrentUser() {
    if (currentUserRequest) {
      return currentUserRequest;
    }

    currentUserRequest = (async () => {
      const session = await this.getAuthSession();
      if (!session.ok || !session.data?.user) {
        return null;
      }

      const profile = await this.getMe();
      return profile.ok && profile.data?.user
        ? profile.data.user
        : session.data.user;
    })();

    try {
      return await currentUserRequest;
    } finally {
      currentUserRequest = null;
    }
  },
};
