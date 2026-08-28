/*
 * I’m This shared auth helper (legacy global name retained for compatibility)
 * Reads login state from the backend via httpOnly JWT cookies.
 */
(function () {
  'use strict';

  var RECENT_AUTH_STORAGE_KEY = 'dropcv_recent_auth';
  var RECENT_AUTH_MAX_AGE_MS = 15000;

  function getDashboardUrl(plan) {
    return 'dashboard.html';
  }

  function getInitials(first, last) {
    return ((first && first[0]) || '') + ((last && last[0]) || '');
  }

  function getUser() {
    return window.currentUser || null;
  }

  function markRecentAuth(reason) {
    try {
      window.sessionStorage.setItem(
        RECENT_AUTH_STORAGE_KEY,
        JSON.stringify({
          at: Date.now(),
          reason: reason || 'auth',
        })
      );
    } catch (error) {}
  }

  function getRecentAuth() {
    try {
      var raw = window.sessionStorage.getItem(RECENT_AUTH_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.at !== 'number') {
        return null;
      }

      if (Date.now() - parsed.at > RECENT_AUTH_MAX_AGE_MS) {
        clearRecentAuth();
        return null;
      }

      return parsed;
    } catch (error) {
      return null;
    }
  }

  function clearRecentAuth() {
    try {
      window.sessionStorage.removeItem(RECENT_AUTH_STORAGE_KEY);
    } catch (error) {}
  }

  function getPublicUrl(user) {
    if (!user) {
      return '';
    }

    return (
      user.publicUrl ||
      user.domains?.[0]?.full_url ||
      (user.slug ? `https://${user.slug}.imthis.site/` : '')
    );
  }

  function getDropCVApi() {
    if (window.dropCVApi && typeof window.dropCVApi.getCurrentUser === 'function') {
      return window.dropCVApi;
    }

    return null;
  }

  async function waitForDropCVApi() {
    var api = getDropCVApi();
    if (api) {
      return api;
    }

    for (var attempt = 0; attempt < 40; attempt += 1) {
      await new Promise(function (resolve) {
        setTimeout(resolve, 50);
      });

      api = getDropCVApi();
      if (api) {
        return api;
      }
    }

    return null;
  }

  async function handleSignOut() {
    var api = await waitForDropCVApi();
    if (api && typeof api.logout === 'function') {
      await api.logout();
    }
    clearRecentAuth();
    window.currentUser = null;
    window.location.href = 'index.html';
  }

  function setTextIfPresent(id, value) {
    var el = document.getElementById(id);
    if (el && value !== undefined && value !== null) {
      el.textContent = value;
    }
  }

  function renderLegacyNav(user) {
    var container = document.getElementById('nav-auth-container');
    if (!container) return;

    container.innerHTML = '';

    if (!user) {
      var loginLink = document.createElement('a');
      loginLink.href = 'login.html';
      loginLink.textContent = 'Log in';

      var signupLink = document.createElement('a');
      signupLink.href = 'signup.html';
      signupLink.textContent = 'Sign up';

      container.appendChild(loginLink);
      container.appendChild(signupLink);
      return;
    }

    var avatar = document.createElement('div');
    avatar.textContent = getInitials(user.firstName || '', user.lastName || '');

    var dashboardLink = document.createElement('a');
    dashboardLink.href = getDashboardUrl(user.plan);
    dashboardLink.textContent = 'Dashboard';

    var signoutLink = document.createElement('a');
    signoutLink.href = '#';
    signoutLink.textContent = 'Sign out';
    signoutLink.addEventListener('click', function (event) {
      event.preventDefault();
      handleSignOut();
    });

    container.appendChild(avatar);
    container.appendChild(dashboardLink);
    container.appendChild(signoutLink);
  }

  function renderFloatingDashboard(user) {
    var floatingDashboard =
      document.getElementById('floatingDashboard') ||
      document.getElementById('floating-dashboard-btn');

    if (!floatingDashboard) return;

    if (user) {
      floatingDashboard.style.display = 'flex';
      floatingDashboard.href = getDashboardUrl(user.plan);
    } else {
      floatingDashboard.style.display = 'none';
    }
  }

  async function initAuth() {
    var api = await waitForDropCVApi();
    if (!api || typeof api.getCurrentUser !== 'function') {
      window.currentUser = null;
      return null;
    }

    var user = await api.getCurrentUser();
    window.currentUser = user;
    if (user) {
      clearRecentAuth();
    }

    var navLogin = document.getElementById('navLogin');
    var navSignup = document.getElementById('navSignup');
    var navAvatar = document.getElementById('navAvatar');
    var navDashboard = document.getElementById('navDashboard');
    var navSignout = document.getElementById('navSignout');
    var floatingDashboard =
      document.getElementById('floatingDashboard') ||
      document.getElementById('floating-dashboard-btn');

    if (navLogin) navLogin.style.display = user ? 'none' : 'block';
    if (navSignup) navSignup.style.display = user ? 'none' : 'block';
    if (navAvatar) {
      if (user) {
        navAvatar.style.display = 'flex';
        navAvatar.textContent = getInitials(user.firstName, user.lastName || '');
      } else {
        navAvatar.style.display = 'none';
      }
    }
    if (navDashboard) {
      if (user) {
        navDashboard.style.display = 'block';
        navDashboard.href = getDashboardUrl(user.plan);
      } else {
        navDashboard.style.display = 'none';
      }
    }
    if (navSignout) {
      navSignout.style.display = user ? 'block' : 'none';
      navSignout.onclick = user ? handleSignOut : null;
    }
    if (floatingDashboard) {
      floatingDashboard.style.display = user ? 'flex' : 'none';
      if (user) {
        floatingDashboard.href = getDashboardUrl(user.plan);
      }
    }

    setTextIfPresent('welcomeName', user ? (user.firstName || user.userName || '') : '');
    setTextIfPresent(
      'userUrlChip',
      getPublicUrl(user),
    );
    setTextIfPresent('planBadge', user ? `${user.plan} Plan` : '');
    setTextIfPresent('sidebarName', user ? (user.profile?.fullName || user.profile?.full_name || user.email || '') : '');
    setTextIfPresent('sidebarEmail', user ? user.email : '');
    setTextIfPresent('user-name', user ? (user.profile?.companyName || user.profile?.company_name || user.firstName || user.email || '') : '');
    setTextIfPresent('user-email', user ? user.email : '');
    setTextIfPresent('user-url', getPublicUrl(user));
    setTextIfPresent('plan-badge', user ? `${user.plan} Plan` : '');
    setTextIfPresent('company-name-display', user ? (user.profile?.companyName || user.profile?.company_name || user.email || '') : '');

    var avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
      if (user) {
        var initials = getInitials(user.firstName || user.userName || '', user.lastName || '');
        if (!initials && user.profile?.fullName) {
          var parts = String(user.profile.fullName).trim().split(/\s+/);
          initials = getInitials(parts[0] || '', parts[parts.length - 1] || '');
        }
        avatarEl.textContent = initials || '?';
      } else {
        avatarEl.textContent = '';
      }
    }

    var welcomeEl = document.querySelector('.welcome-heading');
    if (welcomeEl) {
      if (user) {
        welcomeEl.textContent = 'Welcome back, ' + (user.firstName || user.userName || 'there');
      } else {
        welcomeEl.textContent = welcomeEl.textContent;
      }
    }

    renderLegacyNav(user);
    renderFloatingDashboard(user);

    return user;
  }

  window.dropCV = {
    initAuth: initAuth,
    getUser: getUser,
    getPublicUrl: getPublicUrl,
    getDashboardUrl: getDashboardUrl,
    getInitials: getInitials,
    getRecentAuth: getRecentAuth,
    markRecentAuth: markRecentAuth,
    clearRecentAuth: clearRecentAuth,
    handleSignOut: handleSignOut,
    signOut: handleSignOut,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initAuth();
    });
  } else {
    initAuth();
  }
})();
