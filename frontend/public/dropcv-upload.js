/*
 * drop.cv — Shared upload & deployment system for dashboards
 * Included on dashboard-standard and dashboard-premium.
 *
 * Provides reusable building blocks for the "My Site" section:
 *   - createUploadZone(config) → returns a DOM element with drag/drop,
 *     click-to-browse, file info display, remove button.
 *   - runDeploySimulation(container, opts) → 3-step progress bar animation.
 *   - runPipeline(container, steps) → sequential spinner→check pipeline.
 *   - renderSuccessCard(container, opts) → green check + URL chip + buttons.
 *   - renderStatusCard(container) → "Your site" status card (Home section).
 *   - getDeployment() / setDeployment() → persist to localStorage key
 *     "dropCV_deployment" = { deployed, url, updatedAt, method }.
 *
 * Styling: injects a shared <style> block once (id="dropcv-upload-styles").
 * Uses the drop.cv palette: teal #0F6E56, red #E53E3E, green #10B981.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'dropCV_deployment';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizePublicUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return 'https://' + raw.replace(/^\/+/, '');
  }

  function safeHref(value) {
    var normalized = normalizePublicUrl(value);
    return /^https?:\/\//i.test(normalized) ? normalized : '#';
  }

  // ---------- Shared styles (injected once) ----------
  var STYLE_ID = 'dropcv-upload-styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '/* dropcv-upload shared styles */',
      '.dropcv-upload-zone {',
      '  border: 2px dashed #CBD5E0;',
      '  border-radius: 12px;',
      '  padding: 2.5rem 1.5rem;',
      '  background: #FAFAFA;',
      '  text-align: center;',
      '  transition: all 0.2s ease;',
      '  cursor: pointer;',
      '  position: relative;',
      '}',
      '.dropcv-upload-zone.dragover {',
      '  border-color: #0F6E56;',
      '  border-style: solid;',
      '  background: #F0FAF7;',
      '}',
      '.dropcv-upload-zone.has-file {',
      '  border-color: #0F6E56;',
      '  border-style: solid;',
      '  background: #FFFFFF;',
      '  cursor: default;',
      '}',
      '.dropcv-upload-icon {',
      '  width: 56px; height: 56px;',
      '  color: #0F6E56;',
      '  margin: 0 auto 12px;',
      '  display: block;',
      '}',
      '.dropcv-upload-zone.has-file .dropcv-upload-icon { display: none; }',
      '.dropcv-upload-text {',
      '  font-size: 15px;',
      '  color: #0F0F0F;',
      '  margin: 0 0 6px;',
      '}',
      '.dropcv-upload-hint {',
      '  font-size: 13px;',
      '  color: #666666;',
      '  margin: 0;',
      '}',
      '.dropcv-file-card { display: none; }',
      '.dropcv-upload-zone.has-file .dropcv-file-card { display: block; }',
      '.dropcv-upload-zone.has-file .dropcv-upload-text,',
      '.dropcv-upload-zone.has-file .dropcv-upload-hint,',
      '.dropcv-upload-zone.has-file .dropcv-browse-btn { display: none; }',
      '.dropcv-file-info {',
      '  display: flex; align-items: center; justify-content: center;',
      '  gap: 12px; flex-wrap: wrap;',
      '}',
      '.dropcv-file-check {',
      '  width: 36px; height: 36px; border-radius: 50%;',
      '  background: #10B981; color: #fff;',
      '  display: flex; align-items: center; justify-content: center;',
      '  flex-shrink: 0;',
      '}',
      '.dropcv-file-check svg { width: 20px; height: 20px; }',
      '.dropcv-file-name { font-weight: 600; color: #0F0F0F; }',
      '.dropcv-file-size { font-size: 13px; color: #666; }',
      '.dropcv-file-list {',
      '  display: none; list-style: none; margin: 10px 0 0; padding: 0;',
      '  text-align: left; max-width: 520px; width: 100%;',
      '}',
      '.dropcv-upload-zone.has-file.has-multiple .dropcv-file-list { display: block; }',
      '.dropcv-file-list-item {',
      '  display: flex; justify-content: space-between; gap: 12px;',
      '  padding: 8px 0; border-top: 1px solid #E5E7EB; font-size: 13px; color: #52616b;',
      '}',
      '.dropcv-file-list-item:first-child { border-top: 0; }',
      '.dropcv-file-list-path { font-weight: 600; color: #0F0F0F; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dropcv-file-list-size { flex-shrink: 0; color: #6B7280; }',
      '.dropcv-remove-link {',
      '  color: #E53E3E; cursor: pointer; font-size: 13px;',
      '  text-decoration: underline; background: none; border: none;',
      '  font-family: inherit; padding: 0;',
      '}',
      '.dropcv-browse-btn {',
      '  margin-top: 12px;',
      '}',
      '.dropcv-formats {',
      '  font-size: 12px; color: #A0AEC0; margin-top: 14px; text-align: center;',
      '}',

      '/* Deploy button */',
      '.dropcv-deploy-btn {',
      '  width: 100%; padding: 14px 20px;',
      '  background: #0F6E56; color: #fff; border: none;',
      '  border-radius: 8px; font-size: 16px; font-weight: 600;',
      '  cursor: pointer; font-family: inherit;',
      '  transition: opacity 0.2s; margin-top: 16px;',
      '}',
      '.dropcv-deploy-btn:hover:not(:disabled) { opacity: 0.9; }',
      '.dropcv-deploy-btn:disabled {',
      '  background: #E0E0E0; color: #999; cursor: not-allowed;',
      '}',

      '/* Progress bar (deploy simulation) */',
      '.dropcv-progress-wrap { margin-top: 20px; }',
      '.dropcv-progress-label {',
      '  font-size: 14px; color: #0F0F0F; margin-bottom: 8px; font-weight: 500;',
      '}',
      '.dropcv-progress-bar {',
      '  height: 8px; background: #E0E0E0; border-radius: 4px; overflow: hidden;',
      '}',
      '.dropcv-progress-fill {',
      '  height: 100%; background: #0F6E56; width: 0%;',
      '  transition: width 0.3s ease;',
      '}',

      '/* Pipeline (sequential steps) */',
      '.dropcv-pipeline { margin-top: 20px; display: flex; flex-direction: column; gap: 14px; }',
      '.dropcv-pipeline-step {',
      '  display: flex; align-items: center; gap: 14px;',
      '  padding: 14px 16px; border-radius: 10px; background: #FAFAFA;',
      '}',
      '.dropcv-pipeline-step.completed { background: #F0FAF7; }',
      '.dropcv-pipeline-step-icon {',
      '  width: 32px; height: 32px; flex-shrink: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '.dropcv-pipeline-step.pending .dropcv-pipeline-step-icon::before {',
      '  content: ""; width: 12px; height: 12px; border-radius: 50%; background: #CBD5E0;',
      '}',
      '.dropcv-pipeline-step.active .dropcv-pipeline-step-icon .dropcv-spinner { display: block; }',
      '.dropcv-pipeline-step.completed .dropcv-pipeline-step-icon .dropcv-check { display: block; }',
      '.dropcv-pipeline-step.pending .dropcv-check,',
      '.dropcv-pipeline-step.pending .dropcv-spinner,',
      '.dropcv-pipeline-step.active .dropcv-check,',
      '.dropcv-pipeline-step.completed .dropcv-spinner { display: none; }',
      '.dropcv-spinner {',
      '  width: 22px; height: 22px; border: 3px solid #E0E0E0;',
      '  border-top-color: #0F6E56; border-radius: 50%;',
      '  animation: dropcv-spin 0.8s linear infinite;',
      '}',
      '@keyframes dropcv-spin { to { transform: rotate(360deg); } }',
      '.dropcv-check { width: 26px; height: 26px; color: #10B981; }',
      '.dropcv-pipeline-step-label { font-size: 15px; }',
      '.dropcv-pipeline-step.pending .dropcv-pipeline-step-label { color: #A0AEC0; }',
      '.dropcv-pipeline-step.active .dropcv-pipeline-step-label { color: #0F0F0F; font-weight: 500; }',
      '.dropcv-pipeline-step.completed .dropcv-pipeline-step-label { color: #0F6E56; }',

      '/* Success card */',
      '.dropcv-success-card {',
      '  margin-top: 20px; padding: 28px; text-align: center;',
      '  background: #F0FAF7; border: 1px solid #0F6E56; border-radius: 12px;',
      '}',
      '.dropcv-success-check {',
      '  width: 56px; height: 56px; border-radius: 50%;',
      '  background: #10B981; color: #fff; margin: 0 auto 16px;',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '.dropcv-success-check svg { width: 30px; height: 30px; }',
      '.dropcv-success-title {',
      '  font-size: 22px; font-weight: 700; color: #0F0F0F; margin: 0 0 16px;',
      '}',
      '.dropcv-success-url {',
      '  display: inline-flex; align-items: center; gap: 10px;',
      '  background: #fff; padding: 12px 18px; border-radius: 8px;',
      '  margin: 0 0 16px; font-weight: 600; color: #0F0F0F;',
      '  border: 1px solid #E0E0E0;',
      '}',
      '.dropcv-success-actions {',
      '  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;',
      '}',
      '.dropcv-btn-teal {',
      '  background: #0F6E56; color: #fff; border: none;',
      '  padding: 10px 20px; border-radius: 8px; font-weight: 600;',
      '  font-size: 14px; cursor: pointer; text-decoration: none;',
      '  font-family: inherit; transition: opacity 0.2s;',
      '}',
      '.dropcv-btn-teal:hover { opacity: 0.9; }',
      '.dropcv-btn-ghost {',
      '  background: transparent; color: #0F6E56; border: 1px solid #0F6E56;',
      '  padding: 10px 20px; border-radius: 8px; font-weight: 600;',
      '  font-size: 14px; cursor: pointer; text-decoration: none;',
      '  font-family: inherit; transition: background 0.2s;',
      '}',
      '.dropcv-btn-ghost:hover { background: #F0FAF7; }',
      '.dropcv-copy-btn {',
      '  background: none; border: none; color: #0F6E56; cursor: pointer;',
      '  font-size: 13px; font-weight: 600; font-family: inherit; padding: 0;',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '}',
      '.dropcv-copy-btn svg { width: 16px; height: 16px; }',

      '/* Tab bar */',
      '.dropcv-tab-bar {',
      '  display: flex; gap: 4px; margin-bottom: 20px;',
      '  border-bottom: 1px solid #E0E0E0; flex-wrap: wrap;',
      '}',
      '.dropcv-tab {',
      '  padding: 12px 18px; background: none; border: none; border-bottom: 2px solid transparent;',
      '  font-size: 14px; font-weight: 600; color: #666; cursor: pointer;',
      '  font-family: inherit; transition: all 0.2s;',
      '}',
      '.dropcv-tab:hover { color: #0F0F0F; }',
      '.dropcv-tab.active { color: #0F6E56; border-bottom-color: #0F6E56; }',
      '.dropcv-tab-content { display: none; }',
      '.dropcv-tab-content.active { display: block; }',

      '/* Blurred upgrade card */',
      '.dropcv-upgrade-card {',
      '  margin-top: 24px; padding: 24px; border-radius: 12px;',
      '  background: repeating-linear-gradient(45deg, #FAFAFA, #FAFAFA 10px, #F0F0F0 10px, #F0F0F0 20px);',
      '  border: 1px solid #E0E0E0; text-align: center; position: relative;',
      '}',
      '.dropcv-upgrade-card-inner {',
      '  background: #fff; padding: 20px; border-radius: 8px; display: inline-block;',
      '}',
      '.dropcv-upgrade-card h3 { margin: 0 0 8px; font-size: 16px; color: #0F0F0F; }',
      '.dropcv-upgrade-card p { margin: 0 0 14px; font-size: 14px; color: #666; }',

      '/* Status card (Home section) */',
      '.dropcv-status-card {',
      '  margin-top: 20px; padding: 20px 24px; border-radius: 12px;',
      '  border: 1px solid #E0E0E0; background: #FAFAFA;',
      '}',
      '.dropcv-status-card.live { background: #F0FAF7; border-color: #0F6E56; }',
      '.dropcv-status-row {',
      '  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;',
      '}',
      '.dropcv-status-title { font-size: 16px; font-weight: 700; color: #0F0F0F; }',
      '.dropcv-status-dot {',
      '  width: 10px; height: 10px; border-radius: 50%; background: #10B981;',
      '  display: inline-block; flex-shrink: 0;',
      '}',
      '.dropcv-status-sub { font-size: 14px; color: #666; margin: 6px 0 14px; }',
      '.dropcv-status-url {',
      '  font-weight: 600; color: #0F6E56; font-size: 15px;',
      '}',
      '.dropcv-status-updated { font-size: 13px; color: #999; margin-top: 4px; }',
      '.dropcv-status-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }',
      '.dropcv-status-empty-icon { font-size: 28px; }',

      '/* Story form (premium tab 3) */',
      '.dropcv-story-q {',
      '  margin-bottom: 18px; padding: 18px; background: #fff;',
      '  border: 1px solid #E0E0E0; border-radius: 12px;',
      '}',
      '.dropcv-story-q label {',
      '  display: block; font-weight: 600; font-size: 15px; color: #0F0F0F; margin-bottom: 8px;',
      '}',
      '.dropcv-story-q textarea {',
      '  width: 100%; min-height: 80px; padding: 12px 14px;',
      '  border: 2px solid #E0E0E0; border-radius: 8px; font-family: inherit;',
      '  font-size: 14px; resize: vertical; outline: none; transition: border-color 0.2s;',
      '}',
      '.dropcv-story-q textarea:focus { border-color: #0F6E56; }',
      '.dropcv-story-q.invalid textarea { border-color: #E53E3E; }',
      '.dropcv-story-count { font-size: 12px; color: #999; text-align: right; margin-top: 4px; }',
      '.dropcv-story-error { font-size: 12px; color: #E53E3E; margin-top: 4px; }',
      '.dropcv-story-heading { font-size: 24px; font-weight: 700; margin: 0 0 8px; }',
      '.dropcv-story-sub { font-size: 15px; color: #666; margin: 0 0 24px; }',

      '/* CV preview card (premium story output) */',
      '.dropcv-cv-preview {',
      '  margin-top: 20px; border: 1px solid #E0E0E0; border-radius: 12px; overflow: hidden;',
      '  background: #fff;',
      '}',
      '.dropcv-cv-preview-header {',
      '  padding: 28px; background: #0F6E56; color: #fff;',
      '}',
      '.dropcv-cv-preview-name { font-size: 26px; font-weight: 700; margin: 0; }',
      '.dropcv-cv-preview-title { font-size: 16px; opacity: 0.95; margin: 4px 0 0; }',
      '.dropcv-cv-preview-loc { font-size: 13px; opacity: 0.8; margin-top: 4px; }',
      '.dropcv-cv-preview-body { padding: 24px 28px; }',
      '.dropcv-cv-preview-section { margin-bottom: 22px; }',
      '.dropcv-cv-preview-section:last-child { margin-bottom: 0; }',
      '.dropcv-cv-preview-section h4 {',
      '  font-size: 12px; font-weight: 700; color: #0F6E56; letter-spacing: 1px;',
      '  margin: 0 0 10px; text-transform: uppercase;',
      '}',
      '.dropcv-cv-preview-section p { font-size: 14px; color: #333; line-height: 1.6; margin: 0; }',
      '.dropcv-cv-preview-section ul { margin: 0; padding-left: 20px; }',
      '.dropcv-cv-preview-section li { font-size: 14px; color: #333; line-height: 1.7; }',
      '.dropcv-cv-preview-skills {',
      '  display: flex; flex-wrap: wrap; gap: 8px;',
      '}',
      '.dropcv-cv-preview-skill {',
      '  background: #F0FAF7; color: #0F6E56; padding: 6px 12px;',
      '  border-radius: 6px; font-size: 13px; font-weight: 500;',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---------- Deployment persistence ----------
  function getDeployment() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function setDeployment(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function clearDeployment() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ---------- Icons ----------
  var CLOUD_UPLOAD_SVG = '<svg class="dropcv-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
    '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>' +
    '<polyline points="9 14 12 11 15 14"/>' +
    '<line x1="12" y1="11" x2="12" y2="17"/>' +
    '</svg>';

  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  // ---------- Upload zone ----------
  /**
   * config = {
   *   accept: ".html,.css,.js,.zip",
   *   multiple: true,
   *   formatsText: "Accepted formats: .html .css .js .zip — Max 10MB",
   *   onChange: function(file | file[] | null) {...}  // callback when file(s) selected/removed
   * }
   * Returns { el, getFile, getFiles, reset, setFile, setFiles }
   */
  function createUploadZone(config) {
    var allowMultiple = Boolean(config && config.multiple);
    var state = { files: [] };

    var el = document.createElement('div');
    el.className = 'dropcv-upload-zone';
    el.innerHTML =
      CLOUD_UPLOAD_SVG +
      '<p class="dropcv-upload-text">Drag your files here or click to browse</p>' +
      '<p class="dropcv-upload-hint">Accepted: ' + (config.accept || '') + '</p>' +
      '<button class="dropcv-btn-teal dropcv-browse-btn" type="button">Browse files</button>' +
      '<div class="dropcv-file-card">' +
        '<div class="dropcv-file-info">' +
          '<div class="dropcv-file-check">' + CHECK_SVG + '</div>' +
          '<div>' +
            '<div class="dropcv-file-name"></div>' +
            '<div class="dropcv-file-size"></div>' +
            '<ul class="dropcv-file-list"></ul>' +
          '</div>' +
          '<button class="dropcv-remove-link" type="button">Remove file</button>' +
        '</div>' +
      '</div>';

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = config.accept || '';
    input.multiple = allowMultiple;
    input.style.display = 'none';
    el.appendChild(input);

    function getDisplaySize(files) {
      var total = files.reduce(function (sum, file) { return sum + (file && file.size ? file.size : 0); }, 0);
      return formatSize(total);
    }

    function renderFiles() {
      var files = state.files || [];

      if (files.length > 0) {
        el.classList.add('has-file');
        el.classList.toggle('has-multiple', files.length > 1);
        el.querySelector('.dropcv-file-name').textContent = allowMultiple && files.length > 1
          ? files.length + ' files selected'
          : files[0].name;
        el.querySelector('.dropcv-file-size').textContent = allowMultiple && files.length > 1
          ? getDisplaySize(files) + ' total'
          : formatSize(files[0].size);

        var listEl = el.querySelector('.dropcv-file-list');
        if (allowMultiple && files.length > 1) {
          listEl.innerHTML = files.map(function (file) {
            return '<li class="dropcv-file-list-item"><span class="dropcv-file-list-path">' +
              escapeHtml(file.name) +
              '</span><span class="dropcv-file-list-size">' +
              escapeHtml(formatSize(file.size)) +
              '</span></li>';
          }).join('');
        } else {
          listEl.innerHTML = '';
        }

        el.querySelector('.dropcv-remove-link').textContent = files.length > 1 ? 'Remove files' : 'Remove file';
      } else {
        el.classList.remove('has-file');
        el.classList.remove('has-multiple');
        input.value = '';
        el.querySelector('.dropcv-file-name').textContent = '';
        el.querySelector('.dropcv-file-size').textContent = '';
        el.querySelector('.dropcv-file-list').innerHTML = '';
        el.querySelector('.dropcv-remove-link').textContent = 'Remove file';
      }
    }

    function setFiles(files) {
      var nextFiles = Array.isArray(files) ? files.filter(Boolean) : [];
      state.files = allowMultiple ? nextFiles : nextFiles.slice(0, 1);
      renderFiles();
      if (typeof config.onChange === 'function') {
        config.onChange(allowMultiple ? state.files.slice() : state.files[0] || null, state.files.slice());
      }
    }

    function setFile(file) {
      setFiles(file ? [file] : []);
    }

    // Click to browse (but not when clicking the remove link)
    el.addEventListener('click', function (e) {
      if (e.target.closest('.dropcv-remove-link')) return;
      input.click();
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) {
        setFiles(Array.from(input.files));
      } else {
        setFiles([]);
      }
    });
    // Drag and drop
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (!state.files.length) el.classList.add('dragover');
    });
    el.addEventListener('dragleave', function () {
      el.classList.remove('dragover');
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        setFiles(Array.from(e.dataTransfer.files));
      }
    });
    // Remove
    el.querySelector('.dropcv-remove-link').addEventListener('click', function (e) {
      e.stopPropagation();
      setFiles([]);
    });

    var formatsEl = document.createElement('div');
    formatsEl.className = 'dropcv-formats';
    formatsEl.textContent = config.formatsText || '';
    // formats text is appended separately by caller if desired

    return {
      el: el,
      formatsEl: formatsEl,
      getFile: function () { return state.files[0] || null; },
      getFiles: function () { return state.files.slice(); },
      reset: function () { setFiles([]); },
      setFile: setFile
      ,
      setFiles: setFiles
    };
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // ---------- Deploy simulation (3-step progress bar) ----------
  /**
   * opts = { url, method, onDone }
   * Renders into container: label + progress bar, animates 0→40→80→100,
   * then replaces with success card.
   */
  function runDeploySimulation(container, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var uploadDelay = 240;
    var deployDelay = 180;
    var liveDelay = 120;
    var settleDelay = 120;
    var wrap = document.createElement('div');
    wrap.className = 'dropcv-progress-wrap';
    var label = document.createElement('div');
    label.className = 'dropcv-progress-label';
    label.textContent = 'Uploading files...';
    var bar = document.createElement('div');
    bar.className = 'dropcv-progress-bar';
    var fill = document.createElement('div');
    fill.className = 'dropcv-progress-fill';
    bar.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(bar);
    container.appendChild(wrap);

    function setFill(pct, text) {
      fill.style.width = pct + '%';
      if (text) label.textContent = text;
    }

    // Step 1: Upload (brief confirmation)
    setFill(0, 'Uploading files...');
    setTimeout(function () {
      setFill(40, 'Publishing your live site...');
      // Step 2: Deploy (brief confirmation)
      setTimeout(function () {
        setFill(80, 'Going live...');
        // Step 3: Live (brief confirmation)
        setTimeout(function () {
          setFill(100, 'Going live...');
          setTimeout(function () {
            renderSuccessCard(container, {
              title: opts.title || 'Your site is live!',
              url: opts.url,
              onDone: opts.onDone,
              visitHref: opts.visitHref || '#'
            });
            var dep = {
              deployed: true,
              url: opts.url,
              updatedAt: 'just now',
              method: opts.method || 'files',
              timestamp: Date.now()
            };
            setDeployment(dep);
            if (typeof opts.onDone === 'function') opts.onDone(dep);
            // Refresh any status cards on the page
            refreshAllStatusCards();
          }, settleDelay);
        }, liveDelay);
      }, deployDelay);
    }, uploadDelay);
  }

  // ---------- Pipeline (sequential spinner→check steps) ----------
  /**
   * container: element to render into
   * steps: [{ label, duration(ms) }]
   * onDone: called after last step completes
   */
  function runPipeline(container, steps, onDone) {
    container.innerHTML = '';
    var pipeline = document.createElement('div');
    pipeline.className = 'dropcv-pipeline';
    var stepEls = [];
    steps.forEach(function (s, i) {
      var stepEl = document.createElement('div');
      stepEl.className = 'dropcv-pipeline-step pending';
      stepEl.innerHTML =
        '<div class="dropcv-pipeline-step-icon">' +
          '<div class="dropcv-spinner"></div>' +
          '<svg class="dropcv-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</div>' +
        '<div class="dropcv-pipeline-step-label">' + s.label + '</div>';
      pipeline.appendChild(stepEl);
      stepEls.push(stepEl);
    });
    container.appendChild(pipeline);

    var i = 0;
    function next() {
      if (i >= steps.length) {
        if (typeof onDone === 'function') onDone();
        return;
      }
      var stepEl = stepEls[i];
      var step = steps[i];
      stepEl.classList.remove('pending');
      stepEl.classList.add('active');
      setTimeout(function () {
        stepEl.classList.remove('active');
        stepEl.classList.add('completed');
        i++;
        next();
      }, step.duration || 1500);
    }
    next();
  }

  // ---------- Success card ----------
  function renderSuccessCard(container, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'dropcv-success-card';
    card.innerHTML =
      '<div class="dropcv-success-check">' + CHECK_SVG + '</div>' +
      '<h3 class="dropcv-success-title">' + escapeHtml(opts.title || 'Your site is live!') + '</h3>' +
      '<div class="dropcv-success-url">' +
        '<span class="dropcv-success-url-text">' + escapeHtml(opts.url || '') + '</span>' +
        '<button class="dropcv-copy-btn" type="button">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          '<span class="dropcv-copy-text">Copy</span>' +
        '</button>' +
      '</div>' +
      '<div class="dropcv-success-actions">' +
        '<a class="dropcv-btn-teal" href="' + escapeHtml(safeHref(opts.visitHref)) + '" target="_blank" rel="noopener">Visit site →</a>' +
      '</div>';
    container.appendChild(card);

    var copyBtn = card.querySelector('.dropcv-copy-btn');
    copyBtn.addEventListener('click', function () {
      var url = opts.url || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          var t = card.querySelector('.dropcv-copy-text');
          var orig = t.textContent;
          t.textContent = 'Copied ✓';
          setTimeout(function () { t.textContent = orig; }, 2000);
        }).catch(function () {});
      }
    });
  }

  // ---------- Status card (Home section) ----------
  /**
   * Renders the "Your site" status card into container.
   * Reads dropCV_deployment from localStorage.
   * opts: { goToSiteSelector } - selector for the My Site nav link to click on "Go to My Site"
   */
  function renderStatusCard(container, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var dep = getDeployment();
    var userUrl = '';
    var currentUser = window.currentUser || (window.dropCV && typeof window.dropCV.getUser === 'function' ? window.dropCV.getUser() : null);
    if (currentUser) {
      userUrl =
        (currentUser.publicUrl) ||
        (currentUser.domains && currentUser.domains[0] && normalizePublicUrl(currentUser.domains[0].public_url)) ||
        (window.dropCV && typeof window.dropCV.getPublicUrl === 'function' ? window.dropCV.getPublicUrl(currentUser) : '') ||
        (currentUser.domains && currentUser.domains[0] && currentUser.domains[0].full_url) ||
        (currentUser.slug ? 'https://' + currentUser.slug + '.imthis.site/' : '') ||
        '';
    }

    var serverDep = currentUser && currentUser.latestDeployment ? currentUser.latestDeployment : null;
    var hasDeployment = Boolean((dep && dep.deployed) || serverDep);
    var deploymentStatus = (serverDep && serverDep.status) || ((dep && dep.deployed) ? 'live' : '');
    var isLive = deploymentStatus === 'live' || Boolean(dep && dep.deployed);

    var card = document.createElement('div');
    if (hasDeployment) {
      card.className = 'dropcv-status-card' + (isLive ? ' live' : '');
      card.innerHTML =
        '<div class="dropcv-status-row">' +
          '<span class="dropcv-status-dot"></span>' +
          '<span class="dropcv-status-title">' + (isLive ? 'Live' : 'Draft') + '</span>' +
        '</div>' +
        '<div class="dropcv-status-url">' + escapeHtml((dep && dep.url) || userUrl || 'Preview ready') + '</div>' +
        '<div class="dropcv-status-updated">Deployment status: ' + escapeHtml(deploymentStatus || 'ready') + '</div>' +
        '<div class="dropcv-status-actions">' +
          '<button class="dropcv-btn-ghost dropcv-copy-link" type="button">Copy link</button>' +
          '<a class="dropcv-btn-teal dropcv-visit" href="' + escapeHtml(safeHref(opts.visitHref || (dep && dep.url) || userUrl)) + '" target="_blank" rel="noopener">Visit site →</a>' +
        '</div>';
    } else {
      card.className = 'dropcv-status-card';
      card.innerHTML =
        '<div class="dropcv-status-row">' +
          '<span class="dropcv-status-empty-icon">🚀</span>' +
          '<span class="dropcv-status-title">Your site isn\'t live yet</span>' +
        '</div>' +
        '<div class="dropcv-status-sub">Upload your files to go live</div>' +
        '<div class="dropcv-status-actions">' +
          '<button class="dropcv-btn-teal dropcv-go-site" type="button">Go to My Site →</button>' +
        '</div>';
    }
    container.appendChild(card);

    var goBtn = card.querySelector('.dropcv-go-site');
    if (goBtn) {
      goBtn.addEventListener('click', function () {
        if (opts.onGoToSite) { opts.onGoToSite(); return; }
        // default: click the My Site nav link
        var navLinks = document.querySelectorAll('[data-section], .nav-link, .sidebar-link, a');
        for (var i = 0; i < navLinks.length; i++) {
          var nl = navLinks[i];
          if ((nl.textContent || '').indexOf('My Site') !== -1 ||
              (nl.getAttribute('data-section') || '') === 'site') {
            nl.click();
            return;
          }
        }
      });
    }
    var copyLink = card.querySelector('.dropcv-copy-link');
    if (copyLink) {
      copyLink.addEventListener('click', function () {
        var url = dep && dep.url ? dep.url : userUrl;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            var orig = copyLink.textContent;
            copyLink.textContent = 'Copied ✓';
            setTimeout(function () { copyLink.textContent = orig; }, 2000);
          }).catch(function () {});
        }
      });
    }
  }

  function refreshAllStatusCards() {
    var cards = document.querySelectorAll('[data-dropcv-status]');
    cards.forEach(function (c) { renderStatusCard(c, c._dropcvStatusOpts || {}); });
  }

  // ---------- Tab bar helper ----------
  /**
   * Creates a tab bar. tabs = [{ id, label }]. Returns { el, showTab(id) }.
   * Calls onTab(id) when a tab is clicked.
   */
  function createTabBar(tabs, onTab) {
    var bar = document.createElement('div');
    bar.className = 'dropcv-tab-bar';
    tabs.forEach(function (t, i) {
      var btn = document.createElement('button');
      btn.className = 'dropcv-tab' + (i === 0 ? ' active' : '');
      btn.type = 'button';
      btn.textContent = t.label;
      btn.setAttribute('data-tab', t.id);
      btn.addEventListener('click', function () {
        bar.querySelectorAll('.dropcv-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (typeof onTab === 'function') onTab(t.id);
      });
      bar.appendChild(btn);
    });
    if (tabs.length && typeof onTab === 'function') {
      onTab(tabs[0].id);
    }
    return {
      el: bar,
      showTab: function (id) {
        bar.querySelectorAll('.dropcv-tab').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-tab') === id);
        });
        if (typeof onTab === 'function') onTab(id);
      }
    };
  }

  // ---------- Upgrade card helper ----------
  function createUpgradeCard(heading, body, btnText, btnHref) {
    var card = document.createElement('div');
    card.className = 'dropcv-upgrade-card';
    var safeHref = escapeHtml(btnHref || 'signup.html');
    card.innerHTML =
      '<div class="dropcv-upgrade-card-inner">' +
        '<h3>' + escapeHtml(heading) + '</h3>' +
        '<p>' + escapeHtml(body) + '</p>' +
        '<a class="dropcv-btn-teal" href="' + safeHref + '">' + escapeHtml(btnText) + '</a>' +
      '</div>';
    return card;
  }

  // ---------- Public API ----------
  window.dropcvUpload = {
    injectStyles: injectStyles,
    getDeployment: getDeployment,
    setDeployment: setDeployment,
    clearDeployment: clearDeployment,
    createUploadZone: createUploadZone,
    runDeploySimulation: runDeploySimulation,
    runPipeline: runPipeline,
    renderSuccessCard: renderSuccessCard,
    renderStatusCard: renderStatusCard,
    refreshAllStatusCards: refreshAllStatusCards,
    createTabBar: createTabBar,
    createUpgradeCard: createUpgradeCard,
    formatSize: formatSize
  };
})();
