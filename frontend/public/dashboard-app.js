(function () {
  "use strict";
  var sessionRedirecting = false;
  window.addEventListener("dropcv:session-expired", function () {
    if (sessionRedirecting) return;
    sessionRedirecting = true;
    location.replace("login.html?next=dashboard.html");
  });
  var state = {
    user: null,
    siteRequests: [],
    sites: [],
    language: localStorage.getItem("dropcv_language") || localStorage.getItem("dropcv_lang") || "fa",
    upload: null,
  };
  var icons = {
    home: '<svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    site: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    analytics:
      '<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m5 7H2"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1m3 6a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.8-1.8.9-1.9L15 4l-1.9.9L11.3 4h-3l-.7 2-1.8.8-1.9-.9L2 8l.9 1.9L2 11.7v3l2 .7.8 1.8-.9 1.9L6 21l1.9-.9 1.8.9h3l.7-2 1.8-.8 1.9.9L21 17l-.9-1.9z"/></svg>',
    billing:
      '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
  };
  function text(fa, en) {
    return state.language === "en" ? en : fa;
  }
  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function userName() {
    var p = (state.user && state.user.profile) || {};
    return (
      p.fullName || p.full_name || state.user.firstName || state.user.email
    );
  }
  function publicUrl() {
    return (state.user && state.user.publicUrl) || "";
  }
  function formatTrialTimeLeft(endsAt) {
    var milliseconds = new Date(endsAt).getTime() - Date.now();
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return text("کمتر از یک ساعت", "less than an hour");
    var totalHours = Math.ceil(milliseconds / (60 * 60 * 1000));
    var days = Math.floor(totalHours / 24);
    var hours = totalHours % 24;
    if (state.language === "en") {
      return (days ? days + " day" + (days === 1 ? "" : "s") + " and " : "") + hours + " hour" + (hours === 1 ? "" : "s");
    }
    return (days ? days + " روز و " : "") + hours + " ساعت";
  }
  function renderTrialCard(subscription) {
    var card = document.getElementById("trial-card");
    if (subscription.status === "trial") {
      var remaining = formatTrialTimeLeft(subscription.trialEndsAt);
      var end = new Date(subscription.trialEndsAt);
      var date = Number.isNaN(end.getTime()) ? "" : new Intl.DateTimeFormat(
        state.language === "fa" ? "fa-IR" : "en-US",
        { dateStyle: "medium", timeStyle: "short" },
      ).format(end);
      card.className = "notice trial-reminder";
      var grace = subscription.graceEndsAt ? formatTrialTimeLeft(subscription.graceEndsAt) : "";
      card.innerHTML =
        '<div><strong>' + escape(text("نسخهٔ آزمایشی‌ات فعاله", "Your trial is active")) + "</strong>" +
        '<p>' + escape(text("تا " + (date || remaining) + " فرصت داری سایتت را راه بیندازی. برای آنلاین ماندن پس از پایان تریال، اشتراکت را فعال کن.", "You have until " + (date || remaining) + " to get your site ready. Activate your subscription to keep it online after the trial.")) + "</p>" +
        (grace ? '<p class="trial-warning">' + escape(text("نام انتخابی تو تا " + grace + " دیگر محفوظ می‌ماند.", "Your chosen name remains reserved for another " + grace + ".")) + "</p>" : "") + "</div>" +
        '<a class="primary trial-cta" href="billing.html">' + escape(text("فعال نگه‌داشتن سایت", "Keep my site active")) + "</a>";
      return;
    }
    card.className = "notice";
    card.textContent = subscription.status === "draft"
      ? text("آزمایش سه‌روزه پس از تحویل سایت شروع می‌شود.", "Your three-day trial starts when the site is delivered.")
      : text("وضعیت اشتراک: ", "Subscription: ") + (subscription.status || "—");
  }
  function setLanguage(lang) {
    state.language = lang === "en" ? "en" : "fa";
    localStorage.setItem("dropcv_language", state.language);
    document.documentElement.lang = state.language;
    document.documentElement.dir = state.language === "fa" ? "rtl" : "ltr";
    document.documentElement.dataset.langReady = "1";
    document.querySelectorAll("[data-fa][data-en]").forEach(function (el) {
      el.textContent = el.getAttribute("data-" + state.language);
    });
    document.querySelectorAll("body *:not(script):not(style)").forEach(function (el) {
      el.childNodes.forEach(function (node) {
        if (node.nodeType !== 3) return;
        node.nodeValue = node.nodeValue.replace(/[۰-۹٠-٩]/g, function (digit) {
          var fa = "۰۱۲۳۴۵۶۷۸۹", ar = "٠١٢٣٤٥٦٧٨٩";
          var index = fa.indexOf(digit);
          return String(index >= 0 ? index : ar.indexOf(digit));
        });
      });
    });
    var fieldCopy = {
      "site-upload-form": {
        site: ["فایل سایت", "Site files"],
        siteTitle: ["نام سایت", "Site name"],
      },
      "team-site-request": {
        siteType: ["نوع سایت", "Site type"],
        preferredLanguage: ["زبان ترجیحی", "Preferred language"],
        name: ["نام حرفه‌ای", "Professional name"],
        role: ["عنوان شغلی", "Job title"],
        bio: ["معرفی کوتاه", "Short biography"],
        goal: ["هدف اصلی سایت", "Main site goal"],
        skills: ["مهارت‌ها", "Skills"],
        experience: ["تجربه‌ها", "Experience"],
        projects: ["پروژه‌ها و نمونه‌کارها", "Projects and work samples"],
        resume: ["رزومه اختیاری (PDF یا DOCX)", "Optional résumé (PDF or DOCX)"],
        attachments: ["تصاویر و فایل‌های نمونه‌کار", "Images and work attachments"],
        style: ["سبک و رنگ‌ها", "Style and colors"],
        links: ["لینک‌ها و راه تماس", "Links and contact details"],
        notes: ["توضیحات بیشتر", "Additional notes"],
      },
      "settings-form": {
        fullName: ["نام حرفه‌ای", "Professional name"],
        language: ["زبان", "Language"],
        email: ["ایمیل", "Email"],
      },
      "email-form": { newEmail: ["ایمیل جدید", "New email"] },
      "password-form": {
        currentPassword: ["رمز فعلی", "Current password"],
        newPassword: ["رمز جدید", "New password"],
      },
      "delete-form": { password: ["برای تأیید، رمز عبورت را وارد کن", "Enter your password to confirm"] },
    };
    Object.keys(fieldCopy).forEach(function (formId) {
      var form = document.getElementById(formId);
      if (!form) return;
      Object.keys(fieldCopy[formId]).forEach(function (name) {
        var field = form.elements[name];
        var label = field && field.closest("label");
        var leadingText = label && Array.prototype.find.call(label.childNodes, function (node) {
          return node.nodeType === 3 && node.nodeValue.trim();
        });
        if (leadingText) leadingText.nodeValue = fieldCopy[formId][name][state.language === "en" ? 1 : 0];
      });
    });
    var siteType = document.querySelector('[name="siteType"]');
    if (siteType) {
      var optionCopy = state.language === "en"
        ? ["Mixed", "Portfolio", "Biography", "Résumé"]
        : ["ترکیبی", "نمونه‌کار", "بیوگرافی", "رزومه"];
      Array.prototype.forEach.call(siteType.options, function (option, index) { option.textContent = optionCopy[index]; });
    }
    var buttonCopy = {
      "save-brief": ["ذخیره پیش‌نویس", "Save draft"],
      "wizard-prev": ["قبلی", "Previous"],
      "wizard-next": ["بعدی", "Next"],
      "wizard-submit": ["ارسال درخواست ساخت سایت", "Submit site request"],
    };
    Object.keys(buttonCopy).forEach(function (id) {
      var button = document.getElementById(id);
      if (button) button.textContent = buttonCopy[id][state.language === "en" ? 1 : 0];
    });
    var submitCopy = {
      "site-upload-form": ["آپلود و آنلاین کردن سایت", "Upload and publish site"],
      "settings-form": ["ذخیره تنظیمات", "Save settings"],
      "email-form": ["ارسال پیوند تأیید", "Send confirmation link"],
      "password-form": ["تغییر رمز", "Change password"],
      "delete-form": ["حذف همیشگی حساب", "Permanently delete account"],
    };
    Object.keys(submitCopy).forEach(function (formId) {
      var submit = document.querySelector("#" + formId + ' button[type="submit"]');
      if (submit) submit.textContent = submitCopy[formId][state.language === "en" ? 1 : 0];
    });
    document.getElementById("language").textContent =
      state.language === "fa" ? "EN" : "فا";
    renderUser();
    renderSite();
    renderRequestStatus();
    renderAnalytics();
  }
  function show(section) {
    document.querySelectorAll(".page").forEach(function (el) {
      el.classList.toggle("active", el.id === "section-" + section);
    });
    document.querySelectorAll(".nav[data-section]").forEach(function (el) {
      el.classList.toggle("active", el.dataset.section === section);
    });
    var active = document.querySelector(
      '.nav[data-section="' + section + '"] b',
    );
    document.getElementById("page-title").textContent = active
      ? active.textContent
      : "";
    document.getElementById("sidebar").classList.remove("open");
    history.replaceState(null, "", "#" + section);
    if (section === "analytics") renderAnalytics();
    if (section === "sites") renderSite();
  }
  function renderUser() {
    if (!state.user) return;
    var name = userName();
    document.getElementById("account-name").textContent = name;
    document.getElementById("account-plan").textContent = text("سالانه", "Annual");
    document.getElementById("plan-pill").textContent = text("سالانه", "Annual");
    document.getElementById("avatar").textContent = (name || "?")
      .trim()
      .slice(0, 1)
      .toUpperCase();
    document.getElementById("welcome").textContent = text(
      "همه‌چیز برای دیده‌شدن آماده‌ست، ",
      "Everything is ready to help you be seen, ",
    ) + (state.user.firstName || name);
    var sub = state.user.subscription || {};
    renderTrialCard(sub);
    var form = document.getElementById("settings-form");
    form.fullName.value = name || "";
    form.email.value = state.user.email || "";
    form.language.value = state.language;
  }
  function renderSite() {
    if (!state.user) return;
    var dep = state.user.latestDeployment || {};
    var live = dep.status === "live" && publicUrl();
    var card = document.getElementById("site-card");

    if (!dep.id) {
      card.classList.add("empty-site");
      card.innerHTML =
        '<span class="empty-site-step">' +
        text("قدم اول", "Your first step") +
        "</span><h2>" +
        text("اولین صفحه‌ات را بساز", "Build your first page") +
        "</h2><p>" +
        text(
          "سایت آماده‌تان را آپلود کنید یا اطلاعات و نمونه‌کارهایتان را برای تیم ما بفرستید.",
          "Upload an existing site or send your information and work to our team.",
        ) +
        '</p><button class="primary empty-site-action" id="create-site">' +
        text("افزودن سایت جدید", "Add a new site") +
        "</button>";
      document.getElementById("create-site").onclick = function () {
        show("new-site");
      };
      document.getElementById("public-link-card").innerHTML =
        '<h2>' + text("لینک تو بعد از انتشار اینجا آماده می‌شود", "Your link will be ready here after publishing") + '</h2><p>' +
        text("اول سایتت را بساز یا آپلود کن؛ بعد می‌توانی لینک نهایی را کپی و به اشتراک بگذاری.", "Build or upload your site first, then copy and share the final link.") +
        '</p><button class="primary" id="link-empty-action">' + text("ساخت سایت", "Build a site") + "</button>";
      document.getElementById("link-empty-action").onclick = function () { show("new-site"); };
      return;
    }

    card.classList.remove("empty-site");
    card.innerHTML =
      '<div class="site-card-head"><h2>' +
      text("وضعیت سایت", "Site status") +
      '</h2><span><i class="status-dot ' +
      (live ? "live" : "") +
      '"></i>' +
      escape(
        live
          ? text("منتشر شده", "Live")
          : text(
              dep.status === "draft" ? "پیش‌نویس" : "هنوز ساخته نشده",
              dep.status === "draft" ? "Draft" : "Not created",
            ),
      ) +
      '</span></div><div class="url">' +
      escape(
        publicUrl() ||
          text(
            "پس از ساخت پیش‌نمایش، لینک اینجا نمایش داده می‌شود.",
            "Your link will appear after creating a preview.",
          ),
      ) +
      '</div><div class="actions">' +
      (dep.id
        ? '<a class="secondary button-link" href="/proxy/api/preview/' +
          encodeURIComponent(dep.id) +
          '" target="_blank">' +
          text("پیش‌نمایش", "Preview") +
          "</a>"
        : "") +
      (publicUrl()
        ? '<a class="primary button-link" href="' +
          escape(publicUrl()) +
          '" target="_blank" rel="noopener">' +
          text("باز کردن سایت", "Open site") +
          '</a><button class="secondary" id="copy-site">' +
          text("کپی لینک", "Copy link") +
          "</button>"
        : "") +
      (dep.id
        ? '<button class="secondary" id="toggle-publish">' +
          (live ? text("لغو انتشار", "Unpublish") : text("انتشار", "Publish")) +
          "</button>"
        : "") +
      '<button class="secondary" id="replace-site">' +
      text("سایت جدید", "New site") +
      "</button></div>";
    var copy = document.getElementById("copy-site");
    if (copy)
      copy.onclick = function () {
        navigator.clipboard.writeText(publicUrl()).then(function () {
          copy.textContent = text("کپی شد", "Copied");
        });
      };
    var replace = document.getElementById("replace-site");
    if (replace)
      replace.onclick = function () {
        show("new-site");
      };
    var toggle = document.getElementById("toggle-publish");
    if (toggle)
      toggle.onclick = async function () {
        toggle.disabled = true;
        var r = live
          ? await dropCVApi.unpublishSite(dep.id)
          : await dropCVApi.publishSite(dep.id);
        if (r.ok) {
          await refreshUser();
        } else {
          toggle.disabled = false;
          alert(r.error || text("عملیات ناموفق بود", "Action failed"));
        }
      };
    var linkCard = document.getElementById("public-link-card");
    linkCard.innerHTML = publicUrl()
      ? "<h2>" +
        text("لینک قابل اشتراک", "Shareable link") +
        '</h2><div class="url">' +
        escape(publicUrl()) +
        '</div><div class="link-actions"><button class="primary" id="copy-public">' +
        text("کپی لینک", "Copy link") +
        '</button><a class="secondary button-link" href="' +
        escape(publicUrl()) +
        '" target="_blank" rel="noopener">' +
        text("باز کردن", "Open") +
        "</a></div>"
      : "<p>" +
        text(
          "هنوز لینک عمومی ندارید. ابتدا یک سایت اضافه کنید.",
          "You do not have a public link yet. Add a site first.",
        ) +
        "</p>";
    var cp = document.getElementById("copy-public");
    if (cp)
      cp.onclick = function () {
        navigator.clipboard.writeText(publicUrl()).then(function () {
          cp.textContent = text("کپی شد", "Copied");
        });
      };

    var host = document.getElementById("sites-content");
    if (!host) return;
    var sites = Array.isArray(state.sites) ? state.sites : [];
    if (!sites.length) {
      host.innerHTML = '<div class="card empty-site"><span class="empty-site-icon" aria-hidden="true">✦</span><h2>' +
        text("هنوز سایتی ندارید", "You don’t have a site yet") + '</h2><p>' +
        text("برای شروع، اولین سایت شخصی‌تان را بسازید.", "Start by creating your first personal site.") +
        '</p><div class="actions"><button class="primary" id="sites-empty-action">' + text("ساخت سایت", "Create a site") + '</button></div></div>';
      document.getElementById("sites-empty-action").onclick = function () { show("new-site"); };
      return;
    }
    host.innerHTML = sites.map(function (site) {
      var isLive = site.status === "live" && publicUrl();
      var name = site.original_filename || text("سایت شخصی", "Personal site");
      var status = isLive ? text("آنلاین", "Live") : text("پیش‌نویس", "Draft");
      return '<article class="card site-row"><div><div class="site-card-head"><h2>' + escape(name) +
        '</h2><span><i class="status-dot ' + (isLive ? "live" : "") + '"></i>' + status +
        '</span></div><p>' + text("آخرین بروزرسانی", "Last updated") + ': ' +
        escape(new Date(site.updated_at || site.created_at || Date.now()).toLocaleDateString(state.language === "fa" ? "fa-IR" : "en-US")) +
        '</p></div><div class="actions">' +
        '<a class="secondary button-link" href="/proxy/api/preview/' + encodeURIComponent(site.id) + '" target="_blank">' + text("پیش‌نمایش", "Preview") + '</a>' +
        (isLive ? '<a class="primary button-link" href="' + escape(publicUrl()) + '" target="_blank" rel="noopener">' + text("باز کردن", "Open") + '</a>' : '') +
        '</div></article>';
    }).join("");
  }
  function renderRequestStatus() {
    var host = document.getElementById("request-status");
    if (!host) return;
    var request = state.siteRequests && state.siteRequests[0];
    if (!request) {
      host.hidden = true;
      return;
    }
    var labels = {
      draft: text("پیش‌نویس", "Draft"), queued: text("در صف بررسی", "Queued"),
      in_progress: text("در حال ساخت", "In progress"), delivered: text("تحویل شده", "Delivered"),
      cancelled: text("لغو شده", "Cancelled"),
    };
    host.hidden = false;
    host.textContent = text("وضعیت آخرین درخواست: ", "Latest request: ") + (labels[request.status] || request.status);
  }
  async function refreshUser() {
    var results = await Promise.all([dropCVApi.getMe(), dropCVApi.getMySiteRequests(), dropCVApi.getMySites()]);
    var result = results[0];
    if (result.ok && result.data && result.data.user) {
      state.user = result.data.user;
      state.siteRequests = results[1].ok && results[1].data && Array.isArray(results[1].data.requests)
        ? results[1].data.requests : [];
      state.sites = results[2].ok && results[2].data && Array.isArray(results[2].data.sites)
        ? results[2].data.sites : (state.user.latestDeployment?.id ? [state.user.latestDeployment] : []);
      window.currentUser = state.user;
      renderUser();
      renderSite();
      renderRequestStatus();
      return true;
    }
    return false;
  }
  async function renderAnalytics() {
    var host = document.getElementById("analytics-content");
    if (!state.user || !host) return;
    if (!Array.isArray(state.sites) || !state.sites.length) {
      host.innerHTML = '<div class="card empty-site analytics-empty"><span class="empty-site-icon" aria-hidden="true">✦</span><h2>' +
        text("هنوز سایتی ندارید", "You don’t have a site yet") + '</h2><p>' +
        text("بعد از ساخت سایت، آمار بازدیدهایتان اینجا نمایش داده می‌شود.", "Your visit analytics will appear here after you create a site.") +
        '</p><div class="actions"><button class="primary" id="analytics-empty-action">' + text("ساخت سایت", "Create a site") + '</button></div></div>';
      document.getElementById("analytics-empty-action").onclick = function () { show("new-site"); };
      return;
    }
    host.innerHTML = '<div class="skeleton"></div>';
    var result = await dropCVApi.getAnalyticsDashboard();
    if (!result.ok) {
      if (result.status === 402 || result.status === 403) {
        host.innerHTML = '<div class="locked-analytics"><span class="eyebrow">' + text("نمای کلی آمار", "Analytics preview") + '</span><h2>' + text("بفهم چه کسانی صفحه‌ات را می‌بینند", "Understand who sees your page") + '</h2><p>' + text("بازدیدهای واقعی، منابع ورود و روند رشد را یک‌جا دنبال کن.", "Follow real visits, referral sources, and growth in one place.") + '</p><div class="metrics" aria-hidden="true"><div class="metric"><span>' + text("کل بازدید", "Total visits") + '</span><strong>—</strong></div><div class="metric"><span>' + text("بازدید یکتا", "Unique visits") + '</span><strong>—</strong></div><div class="metric"><span>' + text("روند رشد", "Growth") + '</span><strong>—</strong></div></div><a class="primary button-link" href="billing.html">' + text("دیدن امکانات پلن", "See plan features") + '</a></div>';
      } else {
        host.innerHTML = '<p class="error">' + escape(result.error || text("دریافت آمار ممکن نشد.", "Could not load analytics.")) + "</p>";
      }
      return;
    }
    var a = result.data || {};
    var refs = Array.isArray(a.topReferrers) ? a.topReferrers : [];
    host.innerHTML =
      '<div class="metrics"><div class="metric"><span>' +
      text("کل بازدید", "Total views") +
      "</span><strong>" +
      Number(a.totalViews || 0).toLocaleString(
        state.language === "fa" ? "fa-IR" : "en-US",
      ) +
      '</strong></div><div class="metric"><span>' +
      text("بازدیدکننده یکتا", "Unique visitors") +
      "</span><strong>" +
      Number(a.uniqueVisitors || 0).toLocaleString(
        state.language === "fa" ? "fa-IR" : "en-US",
      ) +
      '</strong></div><div class="metric"><span>' +
      text("هفت روز اخیر", "Last 7 days") +
      "</span><strong>" +
      Number(a.viewsThisWeek || 0).toLocaleString(
        state.language === "fa" ? "fa-IR" : "en-US",
      ) +
      "</strong></div></div><h3>" +
      text("منابع ورودی", "Top referrers") +
      "</h3>" +
      (refs.length
        ? "<ul>" +
          refs
            .map(function (r) {
              return (
                "<li><span>" +
                escape(r.referrer) +
                "</span> — " +
                escape(r.count) +
                "</li>"
              );
            })
            .join("") +
          "</ul>"
        : "<p>" +
          text(
            "هنوز بازدیدی ثبت نشده است. لینک خود را به اشتراک بگذارید.",
            "No visits yet. Share your public link.",
          ) +
          "</p>");
  }
  function setupBrief() {
    var form = document.getElementById("team-site-request"),
      saved = localStorage.getItem("dropcv_premium_brief");
    if (saved) {
      try {
        var data = JSON.parse(saved);
        Object.keys(data).forEach(function (k) {
          if (form.elements[k]) form.elements[k].value = data[k];
        });
      } catch (e) {}
    }
    function values() {
      var result = {};
      ["siteType", "name", "role", "bio", "goal", "experience", "projects", "skills", "preferredLanguage", "style", "links", "notes"].forEach(function (key) {
        result[key] = form.elements[key] ? form.elements[key].value.trim() : "";
      });
      return result;
    }
    document.getElementById("save-brief").onclick = function () {
      localStorage.setItem("dropcv_premium_brief", JSON.stringify(values()));
      document.getElementById("brief-result").textContent = text(
        "پیش‌نویس روی این دستگاه ذخیره شد.",
        "Draft saved on this device.",
      );
    };
    form.addEventListener("input", function () {
      document.getElementById("brief-result").textContent = text(
        "تغییرات ذخیره‌نشده داری.",
        "You have unsaved changes.",
      );
    });
    form.onsubmit = async function (e) {
      e.preventDefault();
      var d = values(),
        out = document.getElementById("brief-result");
      var resume = form.elements.resume.files[0] || null,
        attachments = form.elements.attachments.files;
      out.textContent = text("در حال ارسال درخواست…", "Submitting your request…");
      var result = await dropCVApi.submitManualSiteRequest(d, resume, attachments);
      if (result.ok) {
        localStorage.removeItem("dropcv_premium_brief");
        out.textContent = text(
          "درخواست شما ثبت شد. پس از آماده شدن سایت، در حساب شما منتشر می‌شود.",
          "Your request was submitted. We will publish the finished site to your account.",
        );
        await refreshUser();
      } else
        out.innerHTML =
          '<span class="error">' +
          escape(
            result.error || text("ارسال ناموفق بود", "Submission failed"),
          ) +
          "</span>";
    };
  }
  function setupNewSiteFlow() {
    var choice = document.getElementById("new-site-choice"), upload = document.getElementById("new-site-upload"), brief = document.getElementById("new-site-brief");
    if (!choice || !upload || !brief) return;
    function selectPath(path) {
      choice.hidden = true;
      upload.hidden = path !== "upload";
      brief.hidden = path !== "brief";
      var target = path === "upload" ? upload : brief;
      var focus = target.querySelector("input,select,textarea,button");
      if (focus) focus.focus();
    }
    choice.querySelectorAll("[data-path]").forEach(function (button) {
      button.onclick = function () { selectPath(button.dataset.path); };
    });
    document.querySelectorAll(".back-to-paths").forEach(function (button) {
      button.onclick = function () { choice.hidden = false; upload.hidden = true; brief.hidden = true; choice.querySelector("[data-path]").focus(); };
    });
    var step = 1, steps = brief.querySelectorAll(".wizard-step"), progress = brief.querySelectorAll(".wizard-progress i"), prev = document.getElementById("wizard-prev"), next = document.getElementById("wizard-next"), submit = document.getElementById("wizard-submit");
    function renderStep() {
      steps.forEach(function (item) { item.hidden = Number(item.dataset.step) !== step; });
      progress.forEach(function (item, index) { item.classList.toggle("active", index < step); });
      prev.hidden = step === 1;
      next.hidden = step === 5;
      submit.hidden = step !== 5;
    }
    prev.onclick = function () { step = Math.max(1, step - 1); renderStep(); };
    next.onclick = function () {
      var current = brief.querySelector('.wizard-step[data-step="' + step + '"]');
      var invalid = Array.prototype.find.call(current.querySelectorAll("input,select,textarea"), function (field) { return !field.checkValidity(); });
      if (invalid) { invalid.reportValidity(); return; }
      step = Math.min(5, step + 1); renderStep();
      var focus = brief.querySelector('.wizard-step[data-step="' + step + '"] input, .wizard-step[data-step="' + step + '"] textarea, .wizard-step[data-step="' + step + '"] select');
      if (focus) focus.focus();
    };
    renderStep();
  }
  function setupSiteUpload() {
    var form = document.getElementById("site-upload-form");
    var picker = form && form.querySelector(".file-picker");
    var input = form && form.elements.site;
    if (picker && input) {
      input.addEventListener("change", function () {
        var copy = picker.querySelector(".file-picker-copy");
        var list = picker.querySelector(".file-picker-files");
        var names = Array.prototype.map.call(input.files || [], function (file) { return file.name; });
        if (copy) copy.textContent = copy.getAttribute("data-" + state.language) || "Drop files here or click to choose";
        if (list) {
          list.replaceChildren();
          names.forEach(function (name) {
            var chip = document.createElement("span");
            chip.className = "file-picker-file";
            chip.textContent = name;
            list.appendChild(chip);
          });
          list.hidden = !names.length;
        }
      });
      ["dragenter", "dragover"].forEach(function (eventName) {
        picker.addEventListener(eventName, function (event) {
          event.preventDefault();
          picker.classList.add("is-dragging");
        });
      });
      ["dragleave", "drop"].forEach(function (eventName) {
        picker.addEventListener(eventName, function (event) {
          event.preventDefault();
          picker.classList.remove("is-dragging");
        });
      });
      picker.addEventListener("drop", function (event) {
        var files = event.dataTransfer && event.dataTransfer.files;
        if (!files || !files.length) return;
        try {
          var transfer = new DataTransfer();
          Array.prototype.forEach.call(files, function (file) { transfer.items.add(file); });
          input.files = transfer.files;
        } catch (_) {
          /* Browsers that do not allow assigning FileList still support click-to-select. */
        }
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    form.onsubmit = async function (event) {
      event.preventDefault();
      var out = document.getElementById("site-upload-result");
      var files = form.elements.site.files;
      if (!files || !files.length) {
        out.innerHTML = '<span class="error">' + text("حداقل یک فایل سایت انتخاب کنید.", "Choose at least one site file.") + '</span>';
        return;
      }
      var submit = form.querySelector('button[type="submit"]');
      var review = document.getElementById("site-security-review");
      submit.disabled = true;
      if (review) review.hidden = false;
      out.textContent = text("در حال بررسی امنیتی فایل‌ها…", "Checking your files for security…");
      var result;
      try {
        result = await dropCVApi.uploadSite({
          files: files,
          fields: { siteTitle: form.elements.siteTitle.value.trim() },
        });
      } catch (error) {
        result = { ok: false, error: text("بررسی امنیتی انجام نشد. دوباره تلاش کنید.", "Security review failed. Please try again.") };
      }
      submit.disabled = false;
      if (!result.ok) {
        if (review) review.hidden = true;
        out.innerHTML = '<span class="error">' + escape(result.error || text("آپلود ناموفق بود", "Upload failed")) + '</span>';
        return;
      }
      form.reset();
      if (review) review.hidden = true;
      out.textContent = text("سایت آنلاین شد و آزمایش سه‌روزه شما شروع شد.", "Your site is live and your three-day trial has started.");
      await refreshUser();
      show("sites");
    };
  }
  function setupSettings() {
    document.getElementById("settings-form").onsubmit = async function (e) {
      e.preventDefault();
      var out = document.getElementById("settings-result"),
        fullName = this.fullName.value.trim(),
        language = this.language.value;
      out.textContent = text("در حال ذخیره…", "Saving…");
      var result = await dropCVApi.updateSettings({
        fullName: fullName,
        language: language,
      });
      if (result.ok) {
        setLanguage(language);
        out.textContent = text("تنظیمات ذخیره شد.", "Settings saved.");
        await refreshUser();
      } else
        out.innerHTML =
          '<span class="error">' +
          escape(result.error || text("ذخیره ناموفق بود", "Save failed")) +
          "</span>";
    };
  }
  function setupAccountActions() {
    document.getElementById("email-form").onsubmit = async function (event) {
      event.preventDefault();
      var out = document.getElementById("email-result");
      out.textContent = text("در حال ارسال…", "Sending…");
      var result = await dropCVApi.requestEmailChange(this.newEmail.value.trim());
      out.innerHTML = result.ok
        ? text("پیوند تأیید ارسال شد.", "Confirmation link sent.")
        : '<span class="error">' + escape(result.error || text("ارسال ناموفق بود", "Request failed")) + "</span>";
    };
    document.getElementById("password-form").onsubmit = async function (event) {
      event.preventDefault();
      var out = document.getElementById("password-result");
      var result = await dropCVApi.changePassword(this.currentPassword.value, this.newPassword.value);
      if (result.ok) {
        this.reset();
        out.textContent = text("رمز عبور تغییر کرد.", "Password changed.");
      } else {
        out.innerHTML = '<span class="error">' + escape(result.error || text("تغییر رمز ناموفق بود", "Password change failed")) + "</span>";
      }
    };
    document.getElementById("delete-form").onsubmit = async function (event) {
      event.preventDefault();
      if (!confirm(text("حساب و همه اطلاعات شما برای همیشه حذف شود؟", "Permanently delete your account and all data?"))) return;
      var out = document.getElementById("delete-result");
      var result = await dropCVApi.deleteAccount(this.password.value);
      if (result.ok) location.replace("index.html?account=deleted");
      else out.innerHTML = '<span class="error">' + escape(result.error || text("حذف حساب ناموفق بود", "Account deletion failed")) + "</span>";
    };
  }
  async function init() {
    // Render the remembered language immediately while the authenticated
    // dashboard data is loading, avoiding a Persian flash for English users.
    setLanguage(state.language);
    document.querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = icons[el.dataset.icon] || "";
    });
    document.querySelectorAll(".nav[data-section]").forEach(function (el) {
      el.onclick = function () {
        show(el.dataset.section);
        var more = el.closest(".mobile-more");
        if (more) more.open = false;
      };
    });
    document.getElementById("menu").onclick = function () {
      document.getElementById("sidebar").classList.toggle("open");
    };
    document.getElementById("language").onclick = function () {
      var nextLanguage = state.language === "fa" ? "en" : "fa";
      localStorage.setItem("dropcv_language", nextLanguage);
      localStorage.setItem("dropcv_lang", nextLanguage);
      window.location.reload();
    };
    document.getElementById("logout").onclick = async function () {
      await dropCVApi.logout();
      location.replace("login.html");
    };
    var ok = await refreshUser();
    if (!ok) {
      location.replace("login.html?next=dashboard.html");
      return;
    }
    setupBrief();
    setupNewSiteFlow();
    setupSiteUpload();
    setupSettings();
    setupAccountActions();
    setLanguage(state.user.language || state.language);
    document.getElementById("auth-loader").hidden = true;
    document.getElementById("app").hidden = false;
    document.documentElement.dataset.auth = "ready";
    setInterval(function () {
      if (state.user && state.user.subscription) renderTrialCard(state.user.subscription);
    }, 60 * 1000);
    var requestedSection = (location.hash || "#home").slice(1);
    if (
      (!state.user.latestDeployment || !state.user.latestDeployment.id) &&
      requestedSection !== "home" &&
      requestedSection !== "sites" &&
      requestedSection !== "new-site" &&
      requestedSection !== "settings"
    ) {
      requestedSection = "home";
    }
    show(requestedSection);
  }
  init().catch(function (error) {
    document.getElementById("auth-loader").innerHTML =
      '<p class="error">' +
      escape(
        text(
          "داشبورد بارگذاری نشد. صفحه را دوباره باز کنید.",
          "Dashboard failed to load. Refresh the page.",
        ),
      ) +
      "</p>";
    console.error(error);
  });
})();
