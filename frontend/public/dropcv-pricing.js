(function () {
  'use strict';

  var state = {
    plans: null,
    capabilities: null,
    loading: false,
    loadPromise: null,
  };

  function getLang() {
    return window.dropCVI18n && typeof window.dropCVI18n.get === 'function'
      ? window.dropCVI18n.get()
      : 'fa';
  }

  function formatAmount(amount, lang) {
    var locale = lang === 'en' ? 'en-US' : 'fa-IR';
    return new Intl.NumberFormat(locale).format(Number(amount) || 0);
  }

  function applyPlanPrices() {
    if (!state.plans) return;

    var lang = getLang();
    document.querySelectorAll('[data-dropcv-plan-amount]').forEach(function (el) {
      var planName = el.getAttribute('data-dropcv-plan-amount');
      var plan = state.plans[planName];
      if (!plan) return;

      var faAmount = formatAmount(plan.amount, 'fa');
      var enAmount = formatAmount(plan.amount, 'en');

      el.setAttribute('data-fa', faAmount + ' تومان');
      el.setAttribute('data-en', enAmount + ' toman');
      el.textContent = lang === 'en' ? enAmount : faAmount;
    });
  }

  async function loadPlans() {
    if (state.plans) return state.plans;
    if (state.loadPromise) return state.loadPromise;
    if (!window.dropCVApi || typeof window.dropCVApi.getPlans !== 'function') return null;

    state.loading = true;
    state.loadPromise = window.dropCVApi.getPlans()
      .then(function (response) {
        if (response && response.ok && response.data && response.data.plans) {
          state.plans = response.data.plans;
          state.capabilities = response.data.capabilities || null;
          applyPlanPrices();
        }
        return state.plans;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        state.loading = false;
      });

    return state.loadPromise;
  }

  function getPlan(name) {
    if (!state.plans) return null;
    return state.plans[name] || state.plans.Annual || state.plans.Standard || null;
  }

  function getAmount(name) {
    var plan = getPlan(name);
    return plan ? plan.amount : null;
  }

  window.dropCVPricing = {
    load: loadPlans,
    refresh: applyPlanPrices,
    getPlan: getPlan,
    getAmount: getAmount,
    getCapabilities: function () { return state.capabilities; },
    formatAmount: formatAmount,
  };

  document.addEventListener('DOMContentLoaded', function () {
    loadPlans();
    window.addEventListener('dropcv:language', applyPlanPrices);
  });
})();
