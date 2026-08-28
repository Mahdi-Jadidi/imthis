(function () {
  var storageKey = "dropcv-theme";
  var progressHideTimer;

  function pendingRequests() {
    return Number(window.__dropcvPendingRequests || 0);
  }

  function setProgress(active) {
    var progress = document.getElementById("site-request-progress");
    if (!progress) return;
    clearTimeout(progressHideTimer);
    if (active) {
      progress.classList.remove("is-complete");
      progress.classList.add("is-active");
      return;
    }
    progress.classList.add("is-complete");
    progressHideTimer = setTimeout(function () {
      progress.classList.remove("is-active", "is-complete");
    }, 260);
  }

  function mountProgress() {
    if (!document.body || document.getElementById("site-request-progress")) return;
    var progress = document.createElement("div");
    progress.id = "site-request-progress";
    progress.className = "site-request-progress";
    progress.setAttribute("aria-hidden", "true");
    progress.innerHTML = '<span></span>';
    document.body.appendChild(progress);
    setProgress(pendingRequests() > 0);
  }

  function savedTheme() {
    try { return localStorage.getItem(storageKey); } catch (_) { return null; }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(storageKey, theme); } catch (_) {}
    var button = document.getElementById("theme-toggle");
    if (button) {
      var isDark = theme === "dark";
      button.textContent = isDark ? "☀" : "☾";
      button.setAttribute("aria-label", isDark ? "فعال‌سازی حالت روشن" : "فعال‌سازی حالت تیره");
      button.setAttribute("title", isDark ? "حالت روشن" : "حالت تیره");
    }
  }

  function mountToggle() {
    if (document.getElementById("theme-toggle")) return;
    var button = document.createElement("button");
    button.id = "theme-toggle";
    button.className = "theme-toggle";
    button.type = "button";
    button.addEventListener("click", function () {
      setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
    var slot = document.querySelector("[data-theme-slot]");
    if (slot) {
      slot.classList.add("theme-slot");
      slot.appendChild(button);
    } else {
      button.classList.add("is-floating");
      document.body.appendChild(button);
    }
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
  }

  setTheme(savedTheme() === "dark" ? "dark" : "light");
  window.addEventListener("dropcv:request-start", function () { setProgress(true); });
  window.addEventListener("dropcv:request-end", function () { setProgress(pendingRequests() > 0); });
  window.addEventListener("storage", function (event) {
    if (event.key === storageKey && (event.newValue === "light" || event.newValue === "dark")) {
      setTheme(event.newValue);
    }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () {
    mountToggle();
    mountProgress();
  });
  else {
    mountToggle();
    mountProgress();
  }
})();
