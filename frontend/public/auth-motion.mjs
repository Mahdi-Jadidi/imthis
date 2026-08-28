import React, { useEffect, useMemo, useState } from "https://esm.sh/react@19.0.0";
import { createRoot } from "https://esm.sh/react-dom@19.0.0/client";
import { motion, useReducedMotion } from "https://esm.sh/framer-motion@12.41.0?external=react,react-dom";

const h = React.createElement;
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

const COPY = {
  login: {
    fa: {
      title: 'ادامه دادن از همان‌جا',
      body: 'همه چیز همان‌جا منتظر شماست: پیش‌نویس، زبان و نسخه منتشرشده.',
      cards: [
        { kicker: '۰۱', title: 'پیش‌نویس ذخیره', body: 'همان‌جایی که رها کردید، برمی‌گردید.' },
        { kicker: '۰۲', title: 'زبان یک‌دست', body: 'فارسی و انگلیسی بدون به‌هم‌ریختن چیدمان.' },
        { kicker: '۰۳', title: 'انتشار سریع', body: 'وقتی آماده باشید، وارد داشبورد و منتشر کنید.' },
      ],
    },
    en: {
      title: 'Continue where you left off',
      body: 'Your draft, language choice, and published site are all waiting in one place.',
      cards: [
        { kicker: '01', title: 'Draft saved', body: 'Pick up exactly where you left off.' },
        { kicker: '02', title: 'Language in sync', body: 'Switch Persian and English without drift.' },
        { kicker: '03', title: 'Fast publish', body: 'Open the dashboard and go live when ready.' },
      ],
    },
  },
  signup: {
    fa: {
      title: 'رزومه‌تان را به یک سایت زنده تبدیل کنید',
      body: 'حساب بسازید، پیش‌نمایش را ببینید و فقط وقتی آماده شدید منتشر کنید.',
      cards: [
        { kicker: '۰۱', title: 'آزمایش رایگان', body: 'با خیال راحت شروع کنید و بعد تصمیم بگیرید.' },
        { kicker: '۰۲', title: 'ویرایش زنده', body: 'متن، ساختار و جزئیات را قبل از پرداخت تنظیم کنید.' },
        { kicker: '۰۳', title: 'دامنه شخصی', body: 'لینک تمیز و حرفه‌ای خودتان را داشته باشید.' },
      ],
    },
    en: {
      title: 'Turn your CV into a live site',
      body: 'Create the account, review the preview, and publish only when you are ready.',
      cards: [
        { kicker: '01', title: 'Free trial', body: 'Start with room to explore before paying.' },
        { kicker: '02', title: 'Live editing', body: 'Tune copy, structure, and details before publish.' },
        { kicker: '03', title: 'Personal URL', body: 'Keep your own polished imthis.site address.' },
      ],
    },
  },
};

function getLang() {
  return (window.dropCVI18n && typeof window.dropCVI18n.get === 'function' && window.dropCVI18n.get()) || document.documentElement.lang || 'fa';
}

function trialDays(lang) {
  var raw = Number((window.dropCVConfig && window.dropCVConfig.trialDays) || window.dropCVTrialDays || 3);
  var value = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 3;
  if (lang === 'fa') {
    return String(value).replace(/\d/g, function (digit) {
      return FA_DIGITS[Number(digit)] || digit;
    });
  }
  return String(value);
}

function AuthMotion({ mode }) {
  var prefersReducedMotion = useReducedMotion();
  var [lang, setLang] = useState(getLang());

  useEffect(function () {
    var syncLang = function () {
      setLang(getLang());
    };

    syncLang();
    window.addEventListener('dropcv:language', syncLang);
    return function () {
      window.removeEventListener('dropcv:language', syncLang);
    };
  }, []);

  var copy = (COPY[mode] && COPY[mode][lang]) || COPY.signup.en;
  var trialLabel = lang === 'fa' ? trialDays(lang) + ' روز آزمایشی رایگان' : trialDays(lang) + '-day free trial';

  var containerVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.08,
      },
    },
  };

  var cardVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 14 },
    show: { opacity: 1, y: 0 },
  };

  return h(
    motion.section,
    {
      className: 'auth-motion-frame',
      dir: lang === 'fa' ? 'rtl' : 'ltr',
      variants: containerVariants,
      initial: 'hidden',
      animate: 'show',
      layout: true,
    },
    h(
      'div',
      { className: 'auth-motion-head' },
      h(
        'div',
        { className: 'auth-motion-copy' },
        h('div', { className: 'trial-pill' }, trialLabel),
        h('h3', { className: 'auth-motion-title' }, copy.title),
        h('p', { className: 'auth-motion-body' }, copy.body)
      ),
      h(
        motion.div,
        {
          className: 'auth-motion-progress',
          initial: prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 12 },
          animate: prefersReducedMotion
            ? { opacity: 1, scale: 1, y: 0 }
            : { opacity: 1, scale: [1, 1.015, 1], y: 0 },
          transition: prefersReducedMotion
            ? { duration: 0 }
            : { duration: 5.5, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
        },
        h('strong', null, trialDays(lang)),
        h('small', null, lang === 'fa' ? 'روز' : 'days')
      )
    ),
    h(
      'div',
      { className: 'auth-motion-grid' },
      copy.cards.map(function (card, index) {
        return h(
          motion.article,
          {
            key: card.kicker,
            className: 'auth-motion-card' + (index === 0 ? ' is-primary' : ''),
            variants: cardVariants,
            whileHover: prefersReducedMotion ? undefined : { y: -4, scale: 1.01 },
            transition: { type: 'spring', stiffness: 320, damping: 24 },
            layout: true,
          },
          h('small', null, card.kicker),
          h('strong', null, card.title),
          h('span', null, card.body)
        );
      })
    )
  );
}

function mount() {
  var host = document.getElementById('auth-motion');
  if (!host) return;

  createRoot(host).render(h(AuthMotion, { mode: host.dataset.mode || 'signup' }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
