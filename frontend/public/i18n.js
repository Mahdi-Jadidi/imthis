(function () {
  var lang = localStorage.getItem('dropcv_lang') || 'fa';
  var faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function getTrialDays() {
    var trialDays = Number(window.dropCVConfig && window.dropCVConfig.trialDays);
    return Number.isFinite(trialDays) && trialDays > 0 ? Math.round(trialDays) : 3;
  }

  function toLocalizedDigits(value, currentLang) {
    var text = String(value);
    return text;
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

    // Keep all visible UI numerals in Latin form, including Persian copy.
    document.querySelectorAll('body *:not(script):not(style)').forEach(function (el) {
      el.childNodes.forEach(function (node) {
        if (node.nodeType !== 3) return;
        node.nodeValue = node.nodeValue.replace(/[۰-۹٠-٩]/g, function (digit) {
          var fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
          var index = fa.indexOf(digit);
          return String(index >= 0 ? index : ar.indexOf(digit));
        });
      });
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

  // Apply before the first paint; waiting for DOMContentLoaded caused a
  // visible Persian-to-English flash during navigation.
  apply();

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-lang-toggle]').forEach(function (el) {
      el.addEventListener('click', window.dropCVI18n.toggle);
    });
    apply();
  });
})();
