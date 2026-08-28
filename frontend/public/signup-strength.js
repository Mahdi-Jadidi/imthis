(function () {
  var input = document.getElementById('password');
  var root = document.getElementById('password-strength-root');
  if (!input || !root) return;

  var copy = {
    fa: {
      title: 'قدرت رمز عبور',
      subtitle: 'برای امنیت بهتر، از ۱۲ کاراکتر یا بیشتر با ترکیب حروف، عدد و نماد استفاده کنید.',
      levels: ['هنوز شروع نشده', 'خیلی کوتاه', 'ضعیف', 'متوسط', 'خوب', 'قوی', 'خیلی قوی'],
      hints: ['رمز عبور را وارد کنید تا وضعیت آن را ببینید.', 'حداقل ۸ کاراکتر لازم است.', 'حروف بزرگ و کوچک، عدد یا نماد اضافه کنید.', 'بهتر شده؛ کمی طولانی‌ترش کنید.', 'تعادل خوبی دارد؛ تنوع بیشتری اضافه کنید.', 'این رمز عبور قوی است.', 'عالی است؛ رمز عبور بسیار قوی است.'],
      checks: ['۸+ کاراکتر', 'حروف بزرگ و کوچک', 'عدد', 'نماد'],
    },
    en: {
      title: 'Password strength',
      subtitle: 'Use 12+ characters with letters, numbers, and symbols.',
      levels: ['Not started', 'Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'],
      hints: ['Type a password to see its strength.', 'Use at least 8 characters.', 'Add mixed case, a number, or a symbol.', 'A little more length will help.', 'Balanced. Add more variety for extra safety.', 'This password is strong.', 'Excellent password strength.'],
      checks: ['8+ characters', 'Mixed case', 'Number', 'Symbol'],
    },
  };

  root.innerHTML = '<section class="password-strength-panel" aria-live="polite">'
    + '<div class="password-strength-head"><div class="password-strength-copy"><strong class="password-strength-title"></strong><span class="password-strength-subtitle"></span></div><span class="password-strength-badge"></span></div>'
    + '<div class="password-strength-track" aria-hidden="true"><div class="password-strength-fill"></div></div>'
    + '<p class="password-strength-hint"></p><div class="password-strength-checks"></div></section>';

  var panel = root.querySelector('.password-strength-panel');
  var title = root.querySelector('.password-strength-title');
  var subtitle = root.querySelector('.password-strength-subtitle');
  var badge = root.querySelector('.password-strength-badge');
  var fill = root.querySelector('.password-strength-fill');
  var hint = root.querySelector('.password-strength-hint');
  var checks = root.querySelector('.password-strength-checks');

  function language() {
    return window.dropCVI18n && window.dropCVI18n.get && window.dropCVI18n.get() === 'en' ? 'en' : 'fa';
  }

  function evaluate(value) {
    var length = value.length;
    var lower = /[a-z]/.test(value);
    var upper = /[A-Z]/.test(value);
    var number = /\d/.test(value);
    var symbol = /[^A-Za-z0-9]/.test(value);
    var variety = [lower, upper, number, symbol].filter(Boolean).length;
    var index = 0;
    var percent = 0;
    if (length && length < 8) { index = 1; percent = Math.min(28, 12 + length * 2); }
    else if (length >= 8) {
      var score = 1 + (length >= 12 ? 1 : 0) + (variety >= 2 ? 1 : 0) + (variety >= 3 ? 1 : 0) + (variety === 4 ? 1 : 0) + (length >= 16 ? 1 : 0);
      index = Math.min(6, Math.max(2, score));
      percent = [0, 0, 30, 55, 72, 88, 100][index];
    }
    return { index: index, percent: percent, checks: [length >= 8, lower && upper, number, symbol] };
  }

  function render() {
    var lang = language();
    var text = copy[lang];
    var state = evaluate(input.value || '');
    var colors = ['#94a3b8', '#ef4444', '#f59e0b', '#eab308', '#0f6e56', '#0f6e56', '#0a4f3f'];
    title.textContent = text.title;
    subtitle.textContent = text.subtitle;
    badge.textContent = text.levels[state.index];
    hint.textContent = text.hints[state.index];
    badge.style.background = state.index >= 4 ? '#eaf7f2' : state.index ? '#fff4e6' : '#eef2f6';
    badge.style.color = colors[state.index];
    fill.style.width = state.percent + '%';
    fill.style.background = colors[state.index];
    panel.style.borderColor = colors[state.index] + '55';
    panel.dir = lang === 'fa' ? 'rtl' : 'ltr';
    checks.replaceChildren();
    text.checks.forEach(function (label, index) {
      var item = document.createElement('div');
      item.className = 'password-strength-check' + (state.checks[index] ? ' is-on' : '');
      var icon = document.createElement('span');
      icon.className = 'password-strength-check-icon';
      icon.textContent = state.checks[index] ? '✓' : '•';
      var labelNode = document.createElement('span');
      labelNode.textContent = label;
      item.append(icon, labelNode);
      checks.append(item);
    });
  }

  input.setAttribute('aria-describedby', 'password-strength-root');
  input.addEventListener('input', render);
  window.addEventListener('dropcv:language', render);
  render();
})();
