  function currentFile() {
    return location.pathname.split('/').pop();
  }

  function isDashboardFile() {
    return /dashboard-(standard|premium)\.html$/.test(currentFile());
  }

  function getPrimaryDomain(user) {
    var domains = Array.isArray(user && user.domains) ? user.domains : [];
    return domains.find(function (d) { return d.is_primary; }) || domains[0] || null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizePublicUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return 'https://' + raw.replace(/^\/+/, '');
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.textContent = value;
    });
  }

  function setHref(selector, href) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.setAttribute('href', href);
    });
  }

  function setDashboardReady() {
    var content = document.getElementById('dashboardContent');
    if (!content) return;
    content.classList.remove('auth-pending');
    content.classList.add('auth-ready');
  }

  function injectTrialBannerStyles() {
    if (document.getElementById('dropcv-trial-banner-styles')) return;
    var style = document.createElement('style');
    style.id = 'dropcv-trial-banner-styles';
    style.textContent = [
      '.trial-banner { display:flex; align-items:center; gap:14px; padding:14px 20px; border-radius:12px; margin-bottom:24px; border:1px solid; }',
      '.trial-active { background:#F0FAF7; border-color:#D1FAE5; color:#064E3B; }',
      '.trial-urgent { background:#FEF3C7; border-color:#F59E0B; color:#7C2D12; }',
      '.trial-offline { background:#FCEBEB; border-color:#F09595; color:#791F1F; }',
      '.trial-banner-icon { width:36px; height:36px; border-radius:999px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }',
      '.trial-banner-text { flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }',
      '.trial-banner-text strong { font-size:14px; font-weight:600; }',
      '.trial-banner-text span { font-size:13px; opacity:0.85; }',
      '.trial-banner-cta { background:#0F6E56; color:#fff; padding:9px 16px; border-radius:8px; font-size:13px; font-weight:600; text-decoration:none; white-space:nowrap; flex-shrink:0; }',
      '.trial-banner-cta-urgent { background:#E53E3E; }',
      '@media (max-width: 640px) { .trial-banner { align-items:flex-start; flex-wrap:wrap; } .trial-banner-cta { width:100%; text-align:center; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function normalizeTrialStatus(raw) {
    var payload = raw || {};
    var status = String(payload.status || payload.siteStatus || payload.state || '').trim().toLowerCase();
    var daysLeft = Number(
      payload.daysLeft ?? payload.days_left ?? payload.remainingDays ?? payload.days_remaining ?? payload.trialDaysLeft ?? payload.graceDaysLeft ?? payload.daysRemaining ?? 0
    );
    return {
      status: status,
      daysLeft: Number.isFinite(daysLeft) ? daysLeft : 0,
      renewsOn: payload.renewsOn || payload.renews_on || payload.renewalDate || payload.renewal_date || '',
    };
  }

  function getTrialDays() {
    var trialDays = Number(
      window.dropCVTrialDays ||
      (window.dropCVConfig && window.dropCVConfig.trialDays) ||
      3
    );
    return Number.isFinite(trialDays) && trialDays > 0 ? Math.round(trialDays) : 3;
  }

  function getDashboardHomeAnchor() {
    var home = document.getElementById('home');
    if (home) return home;
    var statsGrid = document.querySelector('.stats-grid');
    if (statsGrid) return statsGrid.parentElement || statsGrid;
    var firstSection = document.querySelector('.section');
    if (firstSection) return firstSection;
    return document.getElementById('dashboardContent');
  }

  function ensureTrialBannerMount() {
    var anchor = getDashboardHomeAnchor();
    if (!anchor) return null;
    var existing = document.getElementById('trial-status-banner');
    if (existing) return existing;

    var banner = document.createElement('div');
    banner.id = 'trial-status-banner';
    banner.setAttribute('aria-live', 'polite');
    var statsGrid = anchor.querySelector && anchor.querySelector('.stats-grid');
    if (statsGrid && statsGrid.parentElement === anchor) {
      anchor.insertBefore(banner, statsGrid);
    } else {
      anchor.insertBefore(banner, anchor.firstChild);
    }
    return banner;
  }

  function renderTrialBanner(mode) {
    injectTrialBannerStyles();
    var banner = ensureTrialBannerMount();
    if (!banner) return;

    var trialDays = getTrialDays();
    var daysLeft = Number(mode.daysLeft);
    daysLeft = Number.isFinite(daysLeft) ? Math.max(0, Math.round(daysLeft)) : 0;
    var daysLeftLabel = daysLeft + ' day' + (daysLeft === 1 ? '' : 's');
    var trialLabel = trialDays + '-day trial';
    var isOffline = mode.status === 'offline_grace' || mode.status === 'offline' || mode.status === 'grace' || mode.status === 'expired';
    var isLastDay = daysLeft <= 1 && !isOffline;
    var bannerClass = isOffline ? 'trial-banner trial-offline' : (isLastDay ? 'trial-banner trial-urgent' : 'trial-banner trial-active');
    var iconColor = isOffline ? 'color:#E53E3E' : (isLastDay ? 'color:#B45309' : 'color:#0F6E56');
    var title;
    var body;
    var ctaText;
    var ctaClass = 'trial-banner-cta';

    document.documentElement.dataset.trialStatus = mode.status || '';
    document.documentElement.dataset.trialDaysLeft = String(daysLeft);
    document.documentElement.dataset.trialDaysTotal = String(trialDays);
    window.dropCVTrialState = {
      status: mode.status || '',
      daysLeft: daysLeft,
      trialDays: trialDays,
      renewsOn: mode.renewsOn || ''
    };

    if (isOffline) {
      title = 'Your site is offline';
      body = 'Your site is offline. Your name and content are saved for ' + daysLeftLabel + ' more.';
      ctaText = 'Reactivate my site &rarr;';
      ctaClass += ' trial-banner-cta-urgent';
    } else if (isLastDay) {
      title = 'Last day of your trial';
      body = 'Your site is live during the ' + trialLabel + '. Add payment today to keep it online after the trial ends.';
      ctaText = 'Add payment &rarr;';
    } else {
      title = trialLabel + ' &mdash; ' + daysLeftLabel + ' left';
      body = 'Your site is live during the ' + trialLabel + '. We will remind you when 1 day is left.';
      ctaText = 'Add payment &rarr;';
    }

    banner.className = bannerClass;
    banner.innerHTML = [
      '<div class="trial-banner-icon" style="' + iconColor + '">',
        isOffline
          ? '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.4"/><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.4"/><path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      '</div>',
      '<div class="trial-banner-text">',
        '<strong>' + title + '</strong>',
        '<span>' + body + '</span>',
      '</div>',
      '<a href="billing.html" class="' + ctaClass + '">' + ctaText + '</a>'
    ].join('');
  }

  async function loadTrialBanner(user) {
    if (!window.dropCVApi || typeof window.dropCVApi.request !== 'function') return;

    var res = await window.dropCVApi.request('GET', '/api/users/site-status');
    if (!res.ok || !res.data) return;

    var info = normalizeTrialStatus(res.data);
    var trialDays = getTrialDays();
    var daysLeft = Number(info.daysLeft);
    daysLeft = Number.isFinite(daysLeft) ? Math.max(0, Math.round(daysLeft)) : 0;
    document.documentElement.dataset.trialStatus = info.status || '';
    document.documentElement.dataset.trialDaysLeft = String(daysLeft);
    document.documentElement.dataset.trialDaysTotal = String(trialDays);
    window.dropCVTrialState = {
      status: info.status || '',
      daysLeft: daysLeft,
      trialDays: trialDays,
      renewsOn: info.renewsOn || ''
    };
    if (info.status === 'released') {
      window.location.href = 'site-expired.html';
      return;
    }

    var trialStatuses = ['trial', 'offline_grace', 'offline', 'grace', 'expired'];
    var showBanner = trialStatuses.indexOf(info.status) !== -1 || (!info.status && info.daysLeft > 0);
    if (!showBanner || info.status === 'active' || info.status === 'paid') {
      var existing = document.getElementById('trial-status-banner');
      if (existing) existing.remove();
      return;
    }

    renderTrialBanner(info);
  }

  function getUserUrl(user) {
    var domain = getPrimaryDomain(user);
    return (user && user.publicUrl) || (domain && normalizePublicUrl(domain.public_url || domain.full_url)) || (user && user.slug ? ('https://' + user.slug + '.imthis.site/') : '');
  }

  async function getCurrentUserFromSharedAuth() {
    if (window.dropCV && typeof window.dropCV.initAuth === 'function') {
      return await window.dropCV.initAuth();
    }
    if (typeof initAuth === 'function') {
      return await initAuth();
    }
    return null;
  }

  async function waitForRecentAuthUser() {
    if (!(window.dropCV && typeof window.dropCV.getRecentAuth === 'function' && window.dropCV.getRecentAuth())) {
      return null;
    }

    for (var attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(function (resolve) {
        setTimeout(resolve, 250);
      });

      var user = await getCurrentUserFromSharedAuth();
      if (user) {
        return user;
      }
    }

    return null;
  }

  function renderDomainRows(domains) {
    var domainList = document.getElementById('domainList');
    if (!domainList) return;

    if (!domains.length) {
      domainList.innerHTML = '<div class="empty-state"><p>No active domains yet.</p></div>';
      return;
    }

    domainList.innerHTML = domains.map(function (d) {
      var fullUrl = normalizePublicUrl(d.public_url || d.full_url || (d.slug ? (d.slug + '.imthis.site/') : ''));
      var safeUrl = escapeHtml(fullUrl);
      return [
        '<div class="domain-item">',
          '<div class="domain-header"><div class="domain-info">',
            '<div class="domain-name">' + safeUrl + (d.is_primary ? ' <span class="domain-badge">Primary</span>' : '') + '</div>',
            '<div class="domain-status"><span class="status-dot"></span> Active</div>',
          '</div></div>',
          '<div class="domain-actions">',
            '<button class="btn btn-outline" type="button" data-copy-domain="' + safeUrl + '">Copy</button>',
            '<a href="' + safeUrl + '" target="_blank" rel="noreferrer" class="btn btn-outline">Visit →</a>',
          '</div>',
        '</div>',
      ].join('');
    }).join('');

    domainList.querySelectorAll('[data-copy-domain]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-copy-domain');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).catch(function () {});
        }
      });
    });
  }

  async function loadAnalytics() {
    var chartCanvas = document.getElementById('page-views-chart');
    if (!chartCanvas && !document.getElementById('totalViews') && !document.getElementById('viewsThisWeek')) {
      return;
    }

    var res = await window.dropCVApi.getAnalyticsDashboard();
    if (!res.ok || !res.data) {
      return;
    }

    var data = res.data;
    var totals = {
      totalViews: data.totalViews,
      viewsThisWeek: data.viewsThisWeek,
      uniqueVisitors: data.uniqueVisitors,
      bestDay: data.bestDay || '-'
    };

    Object.keys(totals).forEach(function (key) {
      var el = document.getElementById(key);
      if (el) {
        var val = totals[key];
        el.textContent = (val === null || val === undefined) ? '0' : String(val);
      }
    });

    document.querySelectorAll('[data-analytics-unique]').forEach(function (el) {
      el.textContent = String(data.uniqueVisitors || 0);
    });
    document.querySelectorAll('[data-analytics-best-day]').forEach(function (el) {
      el.textContent = data.bestDay ? new Date(data.bestDay + 'T00:00:00Z').toLocaleDateString() : '-';
    });

    var activity = document.getElementById('recentActivity');
    if (activity) {
      activity.innerHTML = '<h3>Recent activity</h3><div class="empty-state-sm"><p>' +
        ((data.totalViews || 0) === 0
          ? 'No visits yet. Share your link to get started.'
          : 'Recent visit details are not available yet. Your totals above use recorded analytics.') +
        '</p></div>';
    }

    var insightCopy = "We'll show you insights once you have a few visits. Share your link to get started!";
    if ((data.totalViews || 0) >= 5) {
      var topReferrer = Array.isArray(data.topReferrers) && data.topReferrers[0];
      insightCopy = topReferrer
        ? (topReferrer.referrer || 'Direct') + ' is your leading traffic source with ' + topReferrer.count + ' recorded visits.'
        : 'Your profile has enough traffic for insights, but no referrer data is available yet.';
    }
    var summary = document.querySelector('#aiSummary p');
    if (summary) summary.textContent = insightCopy;
    var insights = document.getElementById('aiInsights');
    if (insights) insights.innerHTML = '<div class="ai-insight-card"><h4>Traffic insights</h4><p>' + escapeHtml(insightCopy) + '</p></div>';

    var referrerTable = document.getElementById('referrerTable');
    if (referrerTable && Array.isArray(data.topReferrers)) {
      var referrerTotal = data.topReferrers.reduce(function (sum, row) { return sum + Number(row.count || 0); }, 0);
      referrerTable.innerHTML = data.topReferrers.map(function (row) {
        var percentage = referrerTotal ? Math.round((Number(row.count || 0) / referrerTotal) * 100) + '%' : '0%';
        return '<tr><td>' + escapeHtml(row.referrer || 'Direct') + '</td><td>' + escapeHtml(row.count) + '</td><td>' + percentage + '</td></tr>';
      }).join('') || '<tr><td colspan="3">No visits recorded yet.</td></tr>';
    }

    var countriesList = document.getElementById('countriesList');
    if (countriesList && Array.isArray(data.topCountries)) {
      countriesList.innerHTML = data.topCountries.map(function (row) {
        return '<div class="country-row"><span>' + escapeHtml(row.country || 'Unknown') + '</span><span>' + escapeHtml(row.count) + ' views</span></div>';
      }).join('');
    }

    if (chartCanvas && window.Chart && Array.isArray(data.viewsLast7Days)) {
      var labels = data.viewsLast7Days.map(function (row) {
        return new Date(row.date).toLocaleDateString('en', { weekday: 'short' });
      });
      var counts = data.viewsLast7Days.map(function (row) { return row.count; });

      if (window.__dropcvViewsChart) {
        window.__dropcvViewsChart.destroy();
      }

      window.__dropcvViewsChart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Page Views',
            data: counts,
            backgroundColor: 'rgba(15, 110, 86, 0.8)',
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#E0E0E0' }, ticks: { precision: 0 } },
            x: { grid: { display: false } },
          },
        },
      });
    }
  }

  function loadDeploymentStatus(user) {
    var statusHosts = document.querySelectorAll('[data-dropcv-status]');
    var currentStatusBlock = document.getElementById('site-current-status');
    var url = getUserUrl(user);

    if (document.getElementById('user-url')) {
      setText('#user-url, #userUrlChip, .user-url-chip', url);
    }
    setText('#dashboardPrimaryUrl', url || 'Not published yet');
    setText('#siteStatusValue', url ? 'Live' : 'Not published');
    setText('#siteStatusDetail', url ? 'Your public link is active' : 'Publish your site to activate your link');
    if (url) {
      setHref('[data-user-url]', url);
    }

    if (statusHosts.length && window.dropcvUpload) {
      statusHosts.forEach(function (statusHost) {
        window.dropcvUpload.renderStatusCard(statusHost, {
          visitHref: url,
          onGoToSite: function () {
            var siteLink = document.querySelector('.nav-link[data-section="site"]');
            if (siteLink) siteLink.click();
          }
        });
      });
    }

    if (currentStatusBlock) {
      currentStatusBlock.style.display = url ? '' : 'none';
      var urlEl = document.getElementById('current-status-url');
      if (urlEl) urlEl.textContent = url;
      var updatedEl = document.getElementById('current-status-updated');
      if (updatedEl) updatedEl.textContent = 'Last updated: just now';
      var visitEl = document.getElementById('current-status-visit');
      if (visitEl) visitEl.href = url || '#';
    }
  }

  function populateSettings(user) {
    var profile = (user && user.profile) || {};
    var values = {
      'full-name': profile.full_name || user.fullName || '',
      'job-title': profile.job_title || profile.headline || '',
      'city': profile.city || '',
      'bio': profile.bio || '',
      'contact-email': user.email || '',
      'linkedin-url': profile.linkedin_url || '',
      'phone': profile.phone || ''
    };

    Object.keys(values).forEach(function (id) {
      var field = document.getElementById(id);
      if (field) field.value = values[id];
    });

    document.querySelectorAll('#settings input, #settings textarea').forEach(function (field) {
      field.disabled = true;
    });

    var settingsSection = document.getElementById('settings');
    if (settingsSection && !document.getElementById('settings-readonly-note')) {
      var note = document.createElement('div');
      note.id = 'settings-readonly-note';
      note.className = 'card';
      note.style.marginBottom = '20px';
      note.textContent = 'These details are loaded from your account. Profile editing is not available in this dashboard yet.';
      var subheading = settingsSection.querySelector('.subheading');
      if (subheading) subheading.insertAdjacentElement('afterend', note);
    }
  }

  async function initProfessionalDashboard() {
    if (window.__dropcvSharedDashboardInitialized) {
      return;
    }

    window.__dropcvSharedDashboardInitialized = true;
    var user = await getCurrentUserFromSharedAuth();
    if (!user) {
      user = await waitForRecentAuthUser();
    }
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    var allowedPlans = {
      'dashboard-standard.html': ['Standard'],
      'dashboard-premium.html': ['Premium']
    };
    var allowed = allowedPlans[currentFile()] || [];
    if (allowed.length && allowed.indexOf(user.plan) === -1) {
      window.location.href = window.dropCV.getDashboardUrl(user.plan);
      return;
    }

    window.currentUser = user;
    await loadTrialBanner(user);
    loadDeploymentStatus(user);

    var domains = Array.isArray(user.domains) ? user.domains : [];
    if (!domains.length && (user.publicUrl || user.slug)) {
      domains = [{
        full_url: user.publicUrl || ('https://' + user.slug + '.imthis.site/'),
        is_primary: true
      }];
    }
    renderDomainRows(domains);
    populateSettings(user);

    if (typeof loadAnalytics === 'function') {
      await loadAnalytics();
    }

    if (typeof window.__dropcvAnalyticsLoaded === 'undefined') {
      window.__dropcvAnalyticsLoaded = true;
      window.loadAnalytics = loadAnalytics;
      window.initChart = loadAnalytics;
    }

    setDashboardReady();

    if (!window.__dropcvUploadInitialized && typeof window.initDropcvUpload === 'function') {
      window.__dropcvUploadInitialized = true;
      window.initDropcvUpload();
    }

    var siteLink = document.querySelector('.nav-link[data-section="site"]');
    if (siteLink) {
      siteLink.addEventListener('click', function () {
        setTimeout(function () { loadDeploymentStatus(window.currentUser || user); }, 0);
      });
    }
  }

  function bootstrapDashboard() {
    if (!isDashboardFile()) return;
    initProfessionalDashboard();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrapDashboard);
  } else {
    bootstrapDashboard();
  }
