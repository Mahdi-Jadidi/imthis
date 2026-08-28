const STYLE_ID = 'dashboard-motion-styles';
const LANG_FALLBACK = 'en';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '.dashboard-motion-root { margin: 20px 0 28px; }',
    '.dashboard-motion-shell {',
    '  position: relative;',
    '  overflow: hidden;',
    '  isolation: isolate;',
    '  perspective: 1200px;',
    '  padding: 18px;',
    '  border: 1px solid rgba(15, 110, 86, 0.12);',
    '  border-radius: 18px;',
    '  background: linear-gradient(180deg, #ffffff 0%, #f8fbf9 100%);',
    '  box-shadow: 0 24px 60px rgba(15, 55, 45, 0.08);',
    '}',
    '.dashboard-motion-shell::before {',
    '  content: "";',
    '  position: absolute;',
    '  inset: 0 0 auto;',
    '  height: 2px;',
    '  background: linear-gradient(90deg, rgba(15,110,86,0), rgba(15,110,86,.78), rgba(15,110,86,0));',
    '  opacity: .95;',
    '}',
    '.dashboard-motion-shell.is-mounted { animation: dashboard-motion-enter .45s cubic-bezier(.16, 1, .3, 1) both; }',
    '@keyframes dashboard-motion-enter {',
    '  from { opacity: 0; transform: translateY(16px) scale(.99); }',
    '  to { opacity: 1; transform: translateY(0) scale(1); }',
    '}',
    '.dashboard-motion-head {',
    '  display: flex;',
    '  align-items: flex-start;',
    '  justify-content: space-between;',
    '  gap: 16px;',
    '  flex-wrap: wrap;',
    '  position: relative;',
    '  z-index: 1;',
    '}',
    '.dashboard-motion-copy { min-width: 0; }',
    '.dashboard-motion-kicker {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  padding: 6px 10px;',
    '  border-radius: 999px;',
    '  background: rgba(15,110,86,.08);',
    '  color: #0F6E56;',
    '  font-size: 11px;',
    '  font-weight: 800;',
    '  letter-spacing: .08em;',
    '  text-transform: uppercase;',
    '}',
    '.dashboard-motion-title {',
    '  margin: 10px 0 8px;',
    '  color: #0F0F0F;',
    '  font-size: clamp(22px, 2vw, 32px);',
    '  line-height: 1.15;',
    '  letter-spacing: 0;',
    '}',
    '.dashboard-motion-body {',
    '  max-width: 60ch;',
    '  margin: 0;',
    '  color: #666666;',
    '  font-size: 14px;',
    '  line-height: 1.6;',
    '}',
    '.dashboard-motion-badge {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  padding: 10px 12px;',
    '  border-radius: 999px;',
    '  border: 1px solid rgba(15,110,86,.14);',
    '  background: #fff;',
    '  box-shadow: 0 10px 24px rgba(15,55,45,.08);',
    '  white-space: nowrap;',
    '}',
    '.dashboard-motion-badge strong { font-size: 13px; font-weight: 800; color: #0F0F0F; }',
    '.dashboard-motion-badge span { font-size: 12px; color: #666666; }',
    '.dashboard-motion-progress { margin-top: 16px; position: relative; z-index: 1; }',
    '.dashboard-motion-track {',
    '  height: 8px;',
    '  border-radius: 999px;',
    '  background: #E8E6E1;',
    '  overflow: hidden;',
    '}',
    '.dashboard-motion-fill {',
    '  display: block;',
    '  width: 100%;',
    '  height: 100%;',
    '  border-radius: inherit;',
    '  background: linear-gradient(90deg, #0F6E56, #1A9A78);',
    '  transform: scaleX(0);',
    '  transform-origin: left center;',
    '  transition: transform .7s cubic-bezier(.16, 1, .3, 1);',
    '}',
    '.dashboard-motion-progress-copy {',
    '  margin-top: 8px;',
    '  font-size: 12px;',
    '  color: #666;',
    '}',
    '.dashboard-motion-grid {',
    '  display: grid;',
    '  gap: 12px;',
    '  margin-top: 16px;',
    '  position: relative;',
    '  z-index: 1;',
    '}',
    '.dashboard-motion-grid.home { grid-template-columns: repeat(3, minmax(0, 1fr)); }',
    '.dashboard-motion-grid.site { grid-template-columns: repeat(3, minmax(0, 1fr)); }',
    '.dashboard-motion-card {',
    '  min-width: 0;',
    '  min-height: 108px;',
    '  padding: 14px 15px;',
    '  border: 1px solid rgba(0,0,0,.08);',
    '  border-radius: 16px;',
    '  background: #fff;',
    '  display: flex;',
    '  flex-direction: column;',
    '  justify-content: space-between;',
    '  text-align: start;',
    '  box-shadow: 0 8px 18px rgba(15,55,45,.04);',
    '  opacity: 0;',
    '  transform: translateY(14px);',
    '  transition: opacity .35s ease, transform .35s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease;',
    '}',
    '.dashboard-motion-shell.is-mounted .dashboard-motion-card { opacity: 1; transform: translateY(0); }',
    '.dashboard-motion-card strong { font-size: 15px; color: #0F0F0F; }',
    '.dashboard-motion-card span { color: #666666; font-size: 13px; line-height: 1.45; }',
    '.dashboard-motion-card small { color: #0F6E56; font-size: 12px; font-weight: 800; }',
    '.dashboard-motion-card.is-action {',
    '  background: linear-gradient(180deg, rgba(15,110,86,.10), rgba(15,110,86,.03));',
    '  border-color: rgba(15,110,86,.16);',
    '}',
    '.dashboard-motion-card.is-action button {',
    '  all: unset;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: flex-start;',
    '  gap: 6px;',
    '  width: 100%;',
    '  color: inherit;',
    '  cursor: pointer;',
    '}',
    '.dashboard-motion-card.is-action button:focus-visible {',
    '  outline: 2px solid rgba(15,110,86,.38);',
    '  outline-offset: 4px;',
    '  border-radius: 12px;',
    '}',
    '.dashboard-motion-card.is-action button:hover strong,',
    '.dashboard-motion-card.is-action button:focus-visible strong {',
    '  text-decoration: underline;',
    '}',
    '.dashboard-motion-step {',
    '  display: flex;',
    '  align-items: flex-start;',
    '  gap: 12px;',
    '}',
    '.dashboard-motion-step-num {',
    '  width: 30px;',
    '  height: 30px;',
    '  border-radius: 999px;',
    '  display: grid;',
    '  place-items: center;',
    '  background: rgba(15,110,86,.08);',
    '  color: #0F6E56;',
    '  font-size: 12px;',
    '  font-weight: 800;',
    '  flex: none;',
    '}',
    '.dashboard-motion-step strong { display: block; margin-bottom: 4px; }',
    '.dashboard-motion-step p { margin: 0; color: #666666; font-size: 13px; line-height: 1.45; }',
    '@media (max-width: 960px) {',
    '  .dashboard-motion-head { flex-direction: column; }',
    '  .dashboard-motion-grid.home,',
    '  .dashboard-motion-grid.site { grid-template-columns: 1fr; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  .dashboard-motion-shell,',
    '  .dashboard-motion-card,',
    '  .dashboard-motion-fill {',
    '    animation: none !important;',
    '    transition: none !important;',
    '  }',
    '  .dashboard-motion-card { opacity: 1; transform: none; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
}

function getLang() {
  if (window.dropCVI18n && typeof window.dropCVI18n.get === 'function') {
    return window.dropCVI18n.get() || LANG_FALLBACK;
  }
  return document.documentElement.lang || LANG_FALLBACK;
}

function txt(lang, en, fa) {
  return lang === 'fa' ? fa : en;
}

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[\u06F0-\u06F9]/g, function (digit) { return String(digit.charCodeAt(0) - 1776); })
    .replace(/[\u0660-\u0669]/g, function (digit) { return String(digit.charCodeAt(0) - 1632); });
}

function readNumber(selector, fallback) {
  var el = document.querySelector(selector);
  if (!el) return fallback;
  var text = normalizeDigits(el.textContent || '').replace(/[^\d.-]/g, '');
  var value = Number(text);
  return Number.isFinite(value) ? value : fallback;
}

function readText(selector, fallback) {
  var el = document.querySelector(selector);
  var text = el ? (el.textContent || '').trim() : '';
  return text || fallback;
}

function getTrialDays() {
  var trialDays = Number(window.dropCVTrialDays || (window.dropCVConfig && window.dropCVConfig.trialDays) || 3);
  return Number.isFinite(trialDays) && trialDays > 0 ? Math.round(trialDays) : 3;
}

function getTrialDaysLeft() {
  var fromDataset = Number(normalizeDigits(document.documentElement.dataset.trialDaysLeft || ''));
  if (Number.isFinite(fromDataset) && fromDataset >= 0) return fromDataset;
  if (window.dropCVTrialState && Number.isFinite(Number(window.dropCVTrialState.daysLeft))) {
    return Number(window.dropCVTrialState.daysLeft);
  }
  var banner = document.getElementById('trial-status-banner');
  if (banner) {
    var m = normalizeDigits(banner.textContent || '').match(/(\d+)/);
    if (m) return Number(m[1]);
  }
  return 0;
}

function getUser() {
  if (window.currentUser) return window.currentUser;
  if (window.dropCV && typeof window.dropCV.getUser === 'function') return window.dropCV.getUser();
  return null;
}

function getUserUrl(user) {
  if (!user) return '';
  var domain = Array.isArray(user.domains)
    ? (user.domains.find(function (d) { return d && d.is_primary; }) || user.domains[0])
    : null;
  return user.publicUrl || (domain && (domain.public_url || domain.full_url)) || (user.slug ? user.slug + '.imthis.site' : '');
}

function getSnapshot() {
  var user = getUser();
  var plan = user && user.plan ? user.plan : 'Annual';
  var lang = getLang();
  var trialDays = getTrialDays();
  var trialLeft = getTrialDaysLeft();
  var url = getUserUrl(user) || readText('#user-url', '');
  var totalViews = readNumber('#totalViews', 0);
  var viewsThisWeek = readNumber('#viewsThisWeek', 0);
  var uniqueVisitors = readNumber('#uniqueVisitors', 0);
  var bestDay = readText('#bestDay', '-');

  return {
    key: [lang, plan, trialDays, trialLeft, url, totalViews, viewsThisWeek, uniqueVisitors, bestDay].join('|'),
    lang: lang,
    plan: plan,
    trialDays: trialDays,
    trialLeft: trialLeft,
    url: url,
    totalViews: totalViews,
    viewsThisWeek: viewsThisWeek,
    uniqueVisitors: uniqueVisitors,
    bestDay: bestDay
  };
}

function triggerSiteJump() {
  var link = document.querySelector('.nav-link[data-section="site"]');
  if (link) {
    link.click();
    return;
  }

  var site = document.getElementById('site');
  if (site) {
    site.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function createEl(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function appendAll(parent, children) {
  children.forEach(function (child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      appendAll(parent, child);
      return;
    }
    if (child instanceof Node) {
      parent.appendChild(child);
      return;
    }
    parent.appendChild(document.createTextNode(String(child)));
  });
}

function renderCard(card, index, lang) {
  var article = createEl('article', 'dashboard-motion-card' + (card.action ? ' is-action' : ''));
  article.style.transitionDelay = (index * 80) + 'ms';

  if (card.action) {
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', card.ariaLabel || card.title);
    button.addEventListener('click', triggerSiteJump);
    appendAll(button, [
      createEl('strong', null, card.title),
      createEl('span', null, card.value),
      createEl('small', null, card.note)
    ]);
    article.appendChild(button);
    return article;
  }

  appendAll(article, [
    createEl('strong', null, card.title),
    createEl('span', null, card.value),
    createEl('small', null, card.note)
  ]);
  return article;
}

function buildHome(snapshot) {
  var lang = snapshot.lang;
  var isPremium = snapshot.plan === 'Premium';
  var progress = Math.min(1, Math.max(0, (snapshot.trialDays - snapshot.trialLeft) / snapshot.trialDays));
  var headline = isPremium
    ? txt(lang, 'Premium workspace at a glance', 'فضای پرمیوم شما در یک نگاه')
    : txt(
        lang,
        snapshot.trialLeft > 0 ? (snapshot.trialDays + '-day trial in motion') : 'Trial complete and live',
        snapshot.trialLeft > 0 ? ('آزمایش ' + snapshot.trialDays + ' روزه در جریان است') : 'آزمایش تمام شده و سایت زنده است'
      );
  var body = isPremium
    ? txt(lang, 'Publishing, analytics, and support stay in one place.', 'انتشار، آمار و پشتیبانی همه در یک جا جمع شده‌اند.')
    : txt(lang, 'Publish, measure, and keep momentum in one calm workspace.', 'انتشار، اندازه‌گیری و ادامه دادن در یک فضای آرام.');
  var badgeLabel = isPremium
    ? txt(lang, 'Priority support', 'پشتیبانی ویژه')
    : (snapshot.trialLeft > 0
        ? txt(lang, snapshot.trialLeft + ' days left', snapshot.trialLeft + ' روز مانده')
        : txt(lang, 'Trial active', 'آزمایش فعال'));

  var shell = createEl('section', 'dashboard-motion-shell');
  var head = createEl('div', 'dashboard-motion-head');
  var copy = createEl('div', 'dashboard-motion-copy');
  appendAll(copy, [
    createEl('span', 'dashboard-motion-kicker', txt(lang, 'Live workspace', 'فضای زنده')),
    createEl('h2', 'dashboard-motion-title', headline),
    createEl('p', 'dashboard-motion-body', body)
  ]);

  var badge = createEl('div', 'dashboard-motion-badge');
  appendAll(badge, [
    createEl('strong', null, txt(lang, 'Momentum', 'شتاب')),
    createEl('span', null, badgeLabel)
  ]);

  head.appendChild(copy);
  head.appendChild(badge);

  var progressWrap = createEl('div', 'dashboard-motion-progress');
  var track = createEl('div', 'dashboard-motion-track');
  var fill = createEl('span', 'dashboard-motion-fill');
  fill.style.transform = 'scaleX(0)';
  track.appendChild(fill);
  var progressCopy = createEl(
    'div',
    'dashboard-motion-progress-copy',
    txt(lang, 'Trial progress', 'پیشرفت آزمایش') + ': ' + new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(snapshot.trialDays - snapshot.trialLeft) + '/' + new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(snapshot.trialDays)
  );
  progressWrap.appendChild(track);
  progressWrap.appendChild(progressCopy);

  var cards = [
    {
      title: txt(lang, 'Public URL', 'لینک عمومی'),
      value: snapshot.url || txt(lang, 'Not live yet', 'هنوز منتشر نشده'),
      note: txt(lang, 'Copy it from the top area', 'از بخش بالا کپی کنید')
    },
    {
      title: txt(lang, 'Views this week', 'بازدید این هفته'),
      value: new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(snapshot.viewsThisWeek),
      note: txt(lang, 'Real analytics, not guesses', 'آمار واقعی، نه حدس')
    },
    {
      title: txt(lang, 'Next move', 'قدم بعدی'),
      value: txt(lang, 'Open My Site', 'باز کردن سایت من'),
      note: txt(
        lang,
        isPremium ? 'Move faster with premium tools' : 'Keep building and then upgrade',
        isPremium ? 'با ابزارهای پرمیوم سریع‌تر پیش بروید' : 'ساخت را ادامه دهید و بعد ارتقا دهید'
      ),
      action: true,
      ariaLabel: txt(lang, 'Open My Site', 'باز کردن سایت من')
    }
  ];

  var grid = createEl('div', 'dashboard-motion-grid home');
  cards.forEach(function (card, index) {
    grid.appendChild(renderCard(card, index, lang));
  });

  shell.appendChild(head);
  shell.appendChild(progressWrap);
  shell.appendChild(grid);

  requestAnimationFrame(function () {
    shell.classList.add('is-mounted');
    fill.style.transform = 'scaleX(' + progress + ')';
  });

  return shell;
}

function buildSite(snapshot) {
  var lang = snapshot.lang;
  var isPremium = snapshot.plan === 'Premium';
  var steps = isPremium
    ? [
        { num: '01', title: txt(lang, 'Upload your site', 'بارگذاری سایت'), body: txt(lang, 'HTML / CSS / JS / ZIP', 'HTML / CSS / JS / ZIP') },
        { num: '02', title: txt(lang, 'Upload your CV', 'بارگذاری رزومه'), body: txt(lang, 'PDF / DOC / DOCX / TXT', 'PDF / DOC / DOCX / TXT') },
        { num: '03', title: txt(lang, 'Write your story', 'نوشتن داستان'), body: txt(lang, 'Answer six prompts and publish', 'به 6 پرسش پاسخ دهید و منتشر کنید') }
      ]
    : [
        { num: '01', title: txt(lang, 'Upload your site', 'بارگذاری سایت'), body: txt(lang, 'HTML / CSS / JS / ZIP', 'HTML / CSS / JS / ZIP') },
        { num: '02', title: txt(lang, 'Upload your CV', 'بارگذاری رزومه'), body: txt(lang, 'PDF / DOC / DOCX / TXT', 'PDF / DOC / DOCX / TXT') }
      ];

  var shell = createEl('section', 'dashboard-motion-shell');
  var head = createEl('div', 'dashboard-motion-head');
  var copy = createEl('div', 'dashboard-motion-copy');
  appendAll(copy, [
    createEl('span', 'dashboard-motion-kicker', txt(lang, 'Publishing flow', 'جریان انتشار')),
    createEl('h2', 'dashboard-motion-title', txt(lang, 'Choose the fastest path to go live', 'سریع‌ترین مسیر برای انتشار را انتخاب کنید')),
    createEl('p', 'dashboard-motion-body', txt(lang, 'Files are fastest, CV is easiest, and the story flow is the most guided.', 'فایل‌ها سریع‌ترند، رزومه ساده‌تر است و مسیر داستان، راهنمایی‌شده‌ترین حالت است.'))
  ]);

  var badge = createEl('div', 'dashboard-motion-badge');
  appendAll(badge, [
    createEl('strong', null, txt(lang, 'Ready to build', 'آماده ساخت')),
    createEl('span', null, txt(lang, isPremium ? 'Three paths live' : 'Two paths live', isPremium ? 'سه مسیر فعال' : 'دو مسیر فعال'))
  ]);

  head.appendChild(copy);
  head.appendChild(badge);

  var grid = createEl('div', 'dashboard-motion-grid site');
  steps.forEach(function (step, index) {
    var article = createEl('article', 'dashboard-motion-card');
    article.style.transitionDelay = (index * 80) + 'ms';
    var wrap = createEl('div', 'dashboard-motion-step');
    appendAll(wrap, [
      createEl('span', 'dashboard-motion-step-num', step.num),
      (function () {
        var body = createEl('div');
        appendAll(body, [
          createEl('strong', null, step.title),
          createEl('p', null, step.body)
        ]);
        return body;
      })()
    ]);
    article.appendChild(wrap);
    grid.appendChild(article);
  });

  shell.appendChild(head);
  shell.appendChild(grid);

  requestAnimationFrame(function () {
    shell.classList.add('is-mounted');
  });

  return shell;
}

function renderHost(host) {
  var variant = host.getAttribute('data-dashboard-motion') === 'site' ? 'site' : 'home';
  var snapshot = getSnapshot();
  var key = snapshot.key + '|' + variant;
  if (host._dashboardMotionKey === key) return;

  host._dashboardMotionKey = key;
  host.innerHTML = '';
  host.appendChild(variant === 'site' ? buildSite(snapshot) : buildHome(snapshot));
}

function mount() {
  injectStyles();

  document.querySelectorAll('[data-dashboard-motion]').forEach(function (host) {
    if (host._dashboardMotionState) {
      host._dashboardMotionState.render();
      return;
    }

    var render = function () {
      renderHost(host);
    };

    host._dashboardMotionState = { render: render };
    render();

    var interval = window.setInterval(render, 350);
    window.addEventListener('dropcv:language', render);
    window.addEventListener('resize', render);

    host._dashboardMotionCleanup = function () {
      window.clearInterval(interval);
      window.removeEventListener('dropcv:language', render);
      window.removeEventListener('resize', render);
      delete host._dashboardMotionState;
    };
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
