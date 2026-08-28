(function () {
  var lang = localStorage.getItem('dropcv_lang') || 'fa';
  var faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function getTrialDays() {
    var trialDays = Number(window.dropCVConfig && window.dropCVConfig.trialDays);
    return Number.isFinite(trialDays) && trialDays > 0 ? Math.round(trialDays) : 3;
  }

  function toLocalizedDigits(value, currentLang) {
    var text = String(value);
    if (currentLang !== 'fa') return text;

    return text.replace(/\d/g, function (digit) {
      return faDigits[Number(digit)] || digit;
    });
  }

  function replaceTokens(value, currentLang) {
    return String(value || '').replace(/\{\{\s*trialDays\s*\}\}/g, toLocalizedDigits(getTrialDays(), currentLang));
  }

  function toggleLabel() {
    return lang === 'fa' ? 'Switch to English' : 'Switch to Persian';
  }

  function apply() {
    var trialDays = getTrialDays();

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.dataset.lang = lang;
    document.documentElement.dataset.trialDays = String(trialDays);
    window.dropCVTrialDays = trialDays;

    document.querySelectorAll('[data-fa][data-en]').forEach(function (el) {
      el.textContent = replaceTokens(el.getAttribute('data-' + lang), lang);
    });

    document.querySelectorAll('[data-placeholder-fa][data-placeholder-en]').forEach(function (el) {
      el.placeholder = replaceTokens(el.getAttribute('data-placeholder-' + lang), lang);
    });

    document.querySelectorAll('[data-lang-toggle]').forEach(function (el) {
      el.textContent = lang === 'fa' ? 'EN' : 'FA';
      el.setAttribute('aria-label', toggleLabel());
      el.setAttribute('title', toggleLabel());
    });

    window.dispatchEvent(new CustomEvent('dropcv:language', { detail: { lang: lang } }));
  }

  window.dropCVI18n = {
    get: function () {
      return lang;
    },
    toggle: function () {
      lang = lang === 'fa' ? 'en' : 'fa';
      localStorage.setItem('dropcv_lang', lang);
      apply();
    },
    apply: apply
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-lang-toggle]').forEach(function (el) {
      el.addEventListener('click', window.dropCVI18n.toggle);
    });
    apply();
  });
})();
