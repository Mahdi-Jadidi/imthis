import React, { useEffect, useMemo, useState } from "https://esm.sh/react@19.0.0";
import { createRoot } from "https://esm.sh/react-dom@19.0.0/client";
import { AnimatePresence, motion, useReducedMotion } from "https://esm.sh/framer-motion@12.41.0?external=react,react-dom";

const h = React.createElement;

const STRINGS = {
  fa: {
    title: "قدرت رمز عبور",
    subtitle: "برای امنیت بهتر، از ۱۲ کاراکتر یا بیشتر با ترکیب حروف، عدد و نماد استفاده کنید.",
    levels: {
      empty: "هنوز شروع نشده",
      short: "خیلی کوتاه",
      weak: "ضعیف",
      fair: "متوسط",
      good: "خوب",
      strong: "قوی",
      excellent: "خیلی قوی",
    },
    hints: {
      empty: "رمز عبور را وارد کنید تا وضعیت آن را ببینید.",
      short: "حداقل ۸ کاراکتر لازم است.",
      weak: "حروف بزرگ و کوچک، عدد یا نماد اضافه کنید.",
      fair: "بهتر شده. حالا کمی طولانی‌ترش کنید.",
      good: "تعادل خوبی دارد. یک لایه تنوع دیگر اضافه کنید.",
      strong: "این رمز عبور قوی است. کمی طول بیشتر، عالی‌اش می‌کند.",
      excellent: "عالی است. این رمز عبور در وضعیت بسیار خوبی است.",
    },
    checks: {
      length: "۸+ کاراکتر",
      case: "حروف بزرگ و کوچک",
      number: "عدد",
      symbol: "نماد",
    },
  },
  en: {
    title: "Password strength",
    subtitle: "For better security, aim for 12+ characters with a mix of letters, numbers, and symbols.",
    levels: {
      empty: "Not started",
      short: "Too short",
      weak: "Weak",
      fair: "Fair",
      good: "Good",
      strong: "Strong",
      excellent: "Excellent",
    },
    hints: {
      empty: "Type a password to see the meter move.",
      short: "Use at least 8 characters.",
      weak: "Add mixed case, a number, or a symbol.",
      fair: "Nice. A little more length will help.",
      good: "Balanced. One more layer of variety would help.",
      strong: "Strong already. A bit more length would make it excellent.",
      excellent: "Excellent. This one is in great shape.",
    },
    checks: {
      length: "8+ characters",
      case: "Mixed case",
      number: "Number",
      symbol: "Symbol",
    },
  },
};

const THEME = {
  empty: {
    border: "rgba(148, 163, 184, 0.22)",
    shadow: "0 16px 34px rgba(15, 55, 45, 0.06)",
    badgeBg: "rgba(148, 163, 184, 0.16)",
    badgeColor: "#475569",
    fill: "linear-gradient(90deg, #cbd5e1, #94a3b8)",
  },
  short: {
    border: "rgba(244, 63, 94, 0.18)",
    shadow: "0 16px 34px rgba(244, 63, 94, 0.08)",
    badgeBg: "rgba(254, 226, 226, 0.94)",
    badgeColor: "#b42318",
    fill: "linear-gradient(90deg, #f87171, #ef4444)",
  },
  weak: {
    border: "rgba(245, 158, 11, 0.20)",
    shadow: "0 16px 34px rgba(245, 158, 11, 0.10)",
    badgeBg: "rgba(255, 247, 237, 0.98)",
    badgeColor: "#b45309",
    fill: "linear-gradient(90deg, #f59e0b, #fb923c)",
  },
  fair: {
    border: "rgba(250, 204, 21, 0.20)",
    shadow: "0 16px 34px rgba(250, 204, 21, 0.10)",
    badgeBg: "rgba(254, 252, 232, 0.98)",
    badgeColor: "#92400e",
    fill: "linear-gradient(90deg, #facc15, #f59e0b)",
  },
  good: {
    border: "rgba(15, 110, 86, 0.18)",
    shadow: "0 16px 34px rgba(15, 110, 86, 0.10)",
    badgeBg: "rgba(234, 247, 242, 0.98)",
    badgeColor: "#0f6e56",
    fill: "linear-gradient(90deg, #86efac, #0f6e56)",
  },
  strong: {
    border: "rgba(15, 110, 86, 0.22)",
    shadow: "0 18px 40px rgba(15, 110, 86, 0.12)",
    badgeBg: "rgba(234, 247, 242, 0.98)",
    badgeColor: "#0f6e56",
    fill: "linear-gradient(90deg, #a7f3d0, #0f6e56)",
  },
  excellent: {
    border: "rgba(15, 110, 86, 0.28)",
    shadow: "0 18px 40px rgba(15, 110, 86, 0.16)",
    badgeBg: "linear-gradient(135deg, #0f6e56, #0a4f3f)",
    badgeColor: "#ffffff",
    fill: "linear-gradient(90deg, #bbf7d0, #0f6e56)",
  },
};

function evaluatePassword(password) {
  const value = String(password || "");
  const length = value.length;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  const variety = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

  let level = "empty";
  let percent = 0;
  let score = 0;

  if (length === 0) {
    level = "empty";
    percent = 0;
  } else if (length < 8) {
    level = "short";
    percent = Math.max(12, Math.min(18 + length * 2, 28));
  } else {
    if (length >= 8) score += 1;
    if (length >= 12) score += 1;
    if (variety >= 2) score += 1;
    if (variety >= 3) score += 1;
    if (variety === 4) score += 1;
    if (length >= 16) score += 1;
    score = Math.min(score, 5);

    if (score <= 1) level = "weak";
    else if (score === 2) level = "fair";
    else if (score === 3) level = "good";
    else if (score === 4) level = "strong";
    else level = "excellent";

    percent = {
      weak: 30,
      fair: 55,
      good: 72,
      strong: 88,
      excellent: 100,
    }[level] || 0;
  }

  return { level, percent, hasLower, hasUpper, hasNumber, hasSymbol };
}

function PasswordStrengthMeter() {
  const prefersReducedMotion = useReducedMotion();
  const [password, setPassword] = useState("");
  const [lang, setLang] = useState(function () {
    return (window.dropCVI18n && typeof window.dropCVI18n.get === "function" && window.dropCVI18n.get()) || "fa";
  });

  useEffect(function () {
    const input = document.getElementById("password");
    if (!input) return undefined;

    const sync = function () {
      setPassword(input.value || "");
    };

    input.setAttribute("aria-describedby", "password-strength-root");
    sync();
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);

    return function () {
      input.removeEventListener("input", sync);
      input.removeEventListener("change", sync);
    };
  }, []);

  useEffect(function () {
    const syncLang = function () {
      setLang((window.dropCVI18n && typeof window.dropCVI18n.get === "function" && window.dropCVI18n.get()) || "fa");
    };

    syncLang();
    window.addEventListener("dropcv:language", syncLang);
    return function () {
      window.removeEventListener("dropcv:language", syncLang);
    };
  }, []);

  const copy = STRINGS[lang] || STRINGS.en;
  const strength = useMemo(function () {
    return evaluatePassword(password);
  }, [password]);
  const theme = THEME[strength.level] || THEME.empty;
  const badgeTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 360, damping: 26, mass: 0.8 };
  const barTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 220, damping: 24 };

  const checks = [
    { key: "length", label: copy.checks.length, on: password.length >= 8 },
    { key: "case", label: copy.checks.case, on: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { key: "number", label: copy.checks.number, on: /\d/.test(password) },
    { key: "symbol", label: copy.checks.symbol, on: /[^A-Za-z0-9]/.test(password) },
  ];

  const levelLabel = copy.levels[strength.level] || copy.levels.empty;
  const hint = copy.hints[strength.level] || copy.hints.empty;

  return h(
    "div",
    {
      id: "password-strength-panel",
      className: "password-strength-panel",
      role: "status",
      "aria-live": "polite",
      dir: lang === "fa" ? "rtl" : "ltr",
      style: {
        borderColor: theme.border,
        boxShadow: theme.shadow,
      },
    },
    h(
      "div",
      { className: "password-strength-head" },
      h(
        "div",
        { className: "password-strength-copy" },
        h("div", { className: "password-strength-title" }, copy.title),
        h("div", { className: "password-strength-subtitle" }, copy.subtitle)
      ),
      h(
        AnimatePresence,
        { mode: "wait", initial: false },
        h(
          motion.span,
          {
            key: strength.level,
            className: "password-strength-badge",
            initial: prefersReducedMotion ? false : { opacity: 0, y: 6, scale: 0.96 },
            animate: { opacity: 1, y: 0, scale: 1 },
            exit: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -6, scale: 0.96 },
            transition: badgeTransition,
            style: {
              background: theme.badgeBg,
              color: theme.badgeColor,
              borderColor: theme.border,
            },
          },
          levelLabel
        )
      )
    ),
    h(
      "div",
      { className: "password-strength-track", "aria-hidden": "true" },
      h(motion.div, {
        className: "password-strength-fill",
        initial: false,
        animate: {
          width: `${strength.percent}%`,
          background: theme.fill,
        },
        transition: barTransition,
      })
    ),
    h("div", { className: "password-strength-hint" }, hint),
    h(
      "div",
      { className: "password-strength-checks" },
      checks.map(function (check) {
        return h(
          motion.div,
          {
            key: check.key,
            className: "password-strength-check" + (check.on ? " is-on" : ""),
            initial: false,
            animate: prefersReducedMotion ? { opacity: 1 } : check.on ? { y: -1, scale: 1.01 } : { y: 0, scale: 1 },
            transition: barTransition,
          },
          h("span", { className: "password-strength-check-icon", "aria-hidden": "true" }, check.on ? "✓" : "•"),
          h("span", null, check.label)
        );
      })
    )
  );
}

const host = document.getElementById("password-strength-root");
if (host) {
  createRoot(host).render(h(PasswordStrengthMeter));
}
