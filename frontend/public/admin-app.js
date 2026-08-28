(function () {
  var nf = new Intl.NumberFormat('fa-IR');
  var dt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
  var siteRequestsById = Object.create(null);
  var pendingPaymentRows = [];

  function esc(value) {
    return String(value || '—').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
  function details(payment) { return payment.provider_response || {}; }
  function isSubmittedCardTransfer(payment) {
    var paymentDetails = details(payment);
    return payment.status === 'pending_review' || (payment.status === 'pending' && paymentDetails.method === 'card_transfer' && Boolean(paymentDetails.submitted_at));
  }
  function paymentCode(payment) {
    var code = Number(details(payment).payment_code);
    return Number.isInteger(code) ? String(code).padStart(3, '0') : '—';
  }
  function account(payment) { return esc(payment.full_name || 'بدون نام') + '<br><small>' + esc(payment.email) + '</small>'; }
  function expiresAt(payment) { return new Date(payment.manual_expires_at || (new Date(payment.created_at).getTime() + 24 * 60 * 60 * 1000)); }
  function expiryCountdown(payment) {
    var seconds = Math.max(0, Math.ceil((expiresAt(payment).getTime() - Date.now()) / 1000));
    if (!Number.isFinite(seconds) || seconds <= 0) return 'منقضی شده';
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    return nf.format(hours) + ' ساعت و ' + nf.format(minutes) + ' دقیقه مانده';
  }

  function renderPending(payments) {
    pendingPaymentRows = payments;
    var rows = payments.map(function (payment) {
      return '<tr><td>' + account(payment) + '</td><td>' + esc(payment.plan) + '</td><td>' + nf.format(payment.amount) +
        ' تومان</td><td dir="ltr">' + esc(paymentCode(payment)) + '</td><td>' + dt.format(expiresAt(payment)) +
        '<br><small>' + esc(expiryCountdown(payment)) + '</small></td><td><div class="actions"><button class="approve" data-id="' + esc(payment.id) + '">تأیید</button><button class="reject" data-id="' + esc(payment.id) + '">رد</button></div></td></tr>';
    }).join('');
    document.getElementById('pending-rows').innerHTML = rows || '<tr><td colspan="6" class="muted">درخواستی برای بررسی وجود ندارد.</td></tr>';
  }
  function renderApproved(payments) {
    var rows = payments.map(function (payment) {
      return '<tr><td>' + account(payment) + '</td><td>' + esc(payment.plan) + '</td><td>' + nf.format(payment.amount) +
        ' تومان</td><td dir="ltr">' + esc(payment.reference_id) + '</td><td>' + dt.format(new Date(payment.verified_at || payment.updated_at)) + '</td></tr>';
    }).join('');
    document.getElementById('approved-rows').innerHTML = rows || '<tr><td colspan="5" class="muted">هنوز درخواستی تأیید نشده است.</td></tr>';
  }
  function apiBase() {
    return window.dropCVConfig && window.dropCVConfig.apiBaseUrl ? window.dropCVConfig.apiBaseUrl.replace(/\/$/, '') : '';
  }
  function requestDownloadUrl(id, kind, index) {
    var base = apiBase() + '/api/site-requests/admin/' + encodeURIComponent(id);
    return kind === 'resume' ? base + '/resume' : base + '/attachments/' + index;
  }
  function fileLink(id, kind, index, label, filename) {
    return '<a href="' + esc(requestDownloadUrl(id, kind, index)) + '" class="request-file-link"' +
      ' data-request-id="' + esc(id) + '" data-file-kind="' + esc(kind) + '" data-file-index="' + esc(index == null ? '' : index) +
      '" data-filename="' + esc(filename || 'attachment') + '">' + label + '</a>';
  }
  async function downloadRequestFile(link) {
    var id = link.dataset.requestId;
    var kind = link.dataset.fileKind;
    var index = link.dataset.fileIndex;
    var url = requestDownloadUrl(id, kind, index);
    var originalText = link.textContent;
    link.setAttribute('aria-busy', 'true');
    link.textContent = 'در حال دریافت فایل…';
    window.__dropcvPendingRequests = Number(window.__dropcvPendingRequests || 0) + 1;
    window.dispatchEvent(new Event('dropcv:request-start'));
    try {
      var response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        var error = await response.json().catch(function () { return null; });
        throw new Error((error && error.error) || 'دریافت فایل ممکن نشد.');
      }
      var blob = await response.blob();
      var objectUrl = URL.createObjectURL(blob);
      var download = document.createElement('a');
      download.href = objectUrl;
      download.download = link.dataset.filename || 'attachment';
      document.body.appendChild(download);
      download.click();
      download.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
    } catch (error) {
      document.getElementById('message').textContent = error.message || 'دریافت فایل ممکن نشد.';
    } finally {
      window.__dropcvPendingRequests = Math.max(0, Number(window.__dropcvPendingRequests || 1) - 1);
      window.dispatchEvent(new Event('dropcv:request-end'));
      link.removeAttribute('aria-busy');
      link.textContent = originalText;
    }
  }
  function requestDetail(label, value, full) {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    return '<div class="request-detail' + (full ? ' full' : '') + '"><small>' + esc(label) + '</small><div class="value">' + esc(value) + '</div></div>';
  }
  function asObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    try { return JSON.parse(value || '{}'); } catch (error) { return {}; }
  }
  function asArray(value) {
    if (Array.isArray(value)) return value;
    try {
      var parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { return []; }
  }
  function requestFiles(item) {
    var attachments = asArray(item.attachments);
    var files = item.resume_filename ? fileLink(item.id, 'resume', null, esc(item.resume_filename), item.resume_filename) + '<br>' : '';
    files += attachments.map(function (asset, index) {
      return fileLink(item.id, 'attachment', index, esc(asset.filename || 'ضمیمه'), asset.filename);
    }).join('<br>');
    return files || '<span class="muted">بدون فایل</span>';
  }
  function openRequestDetails(item) {
    if (!item) return;
    var brief = asObject(item.brief);
    var attachments = asArray(item.attachments);
    var files = '';
    if (item.resume_filename) {
      files += fileLink(item.id, 'resume', null, 'رزومه: ' + esc(item.resume_filename), item.resume_filename);
    }
    files += attachments.map(function (asset, index) {
      return fileLink(item.id, 'attachment', index, 'فایل ' + (index + 1) + ': ' + esc(asset.filename || 'ضمیمه'), asset.filename);
    }).join('');
    var fields = [
      ['نوع سایت', brief.siteType], ['نام حرفه‌ای', brief.name], ['عنوان شغلی', brief.role],
      ['معرفی کوتاه', brief.bio, true], ['هدف سایت', brief.goal, true], ['تجربه‌ها', brief.experience, true],
      ['پروژه‌ها و نمونه‌کارها', brief.projects, true], ['مهارت‌ها', brief.skills], ['زبان ترجیحی', brief.preferredLanguage],
      ['سبک و رنگ‌ها', brief.style], ['لینک‌ها و راه تماس', brief.links, true], ['توضیحات بیشتر', brief.notes || item.note, true],
      ['وضعیت درخواست', item.status], ['زمان ارسال', item.created_at ? dt.format(new Date(item.created_at)) : '—'],
      ['یادداشت ادمین', item.admin_note, true],
    ].map(function (field) { return requestDetail(field[0], field[1], field[2]); }).join('');
    if (files) fields += '<div class="request-detail full"><small>فایل‌های ارسالی</small><div class="request-files">' + files + '</div></div>';
    document.getElementById('request-details-title').textContent = brief.name || item.full_name || 'جزئیات درخواست';
    document.getElementById('request-details-subtitle').textContent = item.email || '';
    document.getElementById('request-details-content').innerHTML = '<div class="request-detail-grid">' + fields + '</div>';
    var dialog = document.getElementById('request-details');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  function renderSiteRequests(requests) {
    siteRequestsById = Object.create(null);
    var ordered = requests.slice().sort(function (left, right) {
      return new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime();
    });
    var activeRows = [];
    var cancelledRows = [];
    ordered.forEach(function (item) {
      siteRequestsById[item.id] = item;
      var brief = asObject(item.brief);
      var files = requestFiles(item);
      var statusActions = item.status === 'delivered'
        ? '<span class="muted">تحویل شده</span>'
        : '<button class="request-status" data-id="' + esc(item.id) + '" data-status="in_progress">در حال ساخت</button> <button class="request-status reject" data-id="' + esc(item.id) + '" data-status="cancelled">لغو</button>';
      var delivery = item.status === 'delivered'
        ? '<span class="muted">تحویل شد</span>'
        : '<form class="deliver-site" data-id="' + esc(item.id) + '"><input name="site" type="file" multiple required accept=".html,.htm,.css,.js,.zip"><input name="note" placeholder="یادداشت داخلی (اختیاری)"><button class="approve" type="submit">آپلود و انتشار</button></form>';
      var customer = '<button type="button" class="customer-link" data-request-id="' + esc(item.id) + '">' + esc(item.full_name || brief.name || 'بدون نام') + '</button><br><small>' + esc(item.email) + '</small>';
      var briefCell = '<td style="white-space:normal;min-width:220px"><strong>' + esc(brief.siteType || 'mixed') + '</strong><br>' + esc(brief.name || '') + ' — ' + esc(brief.role || '') + '<br><small>' + esc(brief.bio || brief.goal || brief.projects || item.note || '') + '</small></td>';
      if (item.status === 'cancelled') {
        cancelledRows.push('<tr><td>' + customer + '</td><td>' + files + '</td>' + briefCell + '<td>' + (item.updated_at ? dt.format(new Date(item.updated_at)) : '—') + '</td></tr>');
      } else {
        activeRows.push('<tr><td>' + customer + '</td><td>' + files + '</td>' + briefCell + '<td>' + esc(item.status) + '<br>' + statusActions + '</td><td>' + delivery + '</td></tr>');
      }
    });
    document.getElementById('site-request-rows').innerHTML = activeRows.join('') || '<tr><td colspan="5" class="muted">درخواست فعالی وجود ندارد.</td></tr>';
    document.getElementById('cancelled-site-request-rows').innerHTML = cancelledRows.join('') || '<tr><td colspan="4" class="muted">درخواست لغوشده‌ای وجود ندارد.</td></tr>';
  }
  function showAccessError(response) {
    var accessBlock = document.getElementById('access-block');
    document.getElementById('admin-content').hidden = true;
    accessBlock.hidden = false;
    accessBlock.textContent = response.status === 403
      ? 'این حساب اجازهٔ ورود به پنل مدیریت را ندارد. ایمیل همین حساب را دقیقاً در متغیر ADMIN_EMAILS بک‌اند قرار دهید و دوباره Deploy کنید.'
      : (response.error || 'دریافت اطلاعات پنل مدیریت ممکن نشد.');
  }
  async function pendingPayments(overview) {
    var response = await dropCVApi.getAdminPayments('pending_review');
    var payments = response.data && Array.isArray(response.data.payments) ? response.data.payments : [];
    if ((!response.ok || !payments.length) && Number(overview.pending_reviews) > 0) {
      var fallback = await dropCVApi.getAdminPayments('all');
      if (fallback.ok && fallback.data && Array.isArray(fallback.data.payments)) payments = fallback.data.payments.filter(isSubmittedCardTransfer);
    }
    if (!response.ok && !payments.length) document.getElementById('message').textContent = response.error || 'دریافت فهرست پرداخت‌ها ممکن نشد.';
    return payments;
  }
  async function load() {
    document.getElementById('admin-content').hidden = true;
    document.getElementById('access-block').hidden = true;
    var overviewResponse = await dropCVApi.getAdminOverview();
    if (!overviewResponse.ok) {
      if (overviewResponse.status === 401) { location.replace('/login?next=admin'); return; }
      showAccessError(overviewResponse);
      return;
    }
    document.getElementById('admin-content').hidden = false;
    var overview = overviewResponse.data.overview;
    var metrics = [
      ['کاربران فعال', overview.total_users], ['اشتراک فعال', overview.active_subscriptions], ['در انتظار بررسی', overview.pending_reviews],
      ['تأیید این ماه', overview.approved_this_month], ['درآمد تأییدشده', nf.format(overview.verified_revenue) + ' تومان'],
    ];
    document.getElementById('metrics').innerHTML = metrics.map(function (metric) {
      return '<div class="metric"><span class="muted">' + metric[0] + '</span><b>' + metric[1] + '</b></div>';
    }).join('');
    var qaAccounts = Number(overview.launchAudit && overview.launchAudit.qa_accounts || 0);
    document.getElementById('message').textContent = qaAccounts ? 'این آمار حساب‌های واقعی را نشان می‌دهد؛ ' + nf.format(qaAccounts) + ' حساب خودکار QA از آن حذف شده‌اند.' : '';
    var results = await Promise.all([pendingPayments(overview), dropCVApi.getAdminPayments('verified'), dropCVApi.getAdminSiteRequests()]);
    renderPending(results[0]);
    var approved = results[1];
    renderApproved(approved.ok && approved.data && Array.isArray(approved.data.payments) ? approved.data.payments : []);
    renderSiteRequests(results[2].ok && results[2].data && Array.isArray(results[2].data.requests) ? results[2].data.requests : []);
  }
  document.addEventListener('click', async function (event) {
    var fileLinkElement = event.target.closest('.request-file-link');
    if (fileLinkElement) {
      event.preventDefault();
      await downloadRequestFile(fileLinkElement);
      return;
    }
    if (event.target.classList.contains('customer-link')) {
      openRequestDetails(siteRequestsById[event.target.dataset.requestId]);
      return;
    }
    if (event.target.classList.contains('request-status')) {
      event.target.disabled = true;
      var update = await dropCVApi.updateAdminSiteRequest(event.target.dataset.id, event.target.dataset.status, '');
      document.getElementById('message').textContent = update.ok ? 'وضعیت درخواست به‌روزرسانی شد.' : (update.error || 'به‌روزرسانی انجام نشد.');
      if (update.ok) await load(); else event.target.disabled = false;
      return;
    }
    var id = event.target.dataset.id;
    if (!id) return;
    var approving = event.target.classList.contains('approve');
    var note = approving ? '' : prompt('دلیل رد پرداخت:');
    if (!approving && !note) return;
    event.target.disabled = true;
    var response = approving ? await dropCVApi.approveAdminPayment(id, note) : await dropCVApi.rejectAdminPayment(id, note);
    document.getElementById('message').textContent = response.ok
      ? (approving ? 'پرداخت تأیید شد و اشتراک فعال گردید.' : 'درخواست رد شد.')
      : (response.error || 'به‌روزرسانی درخواست ممکن نشد.');
    if (response.ok) await load(); else event.target.disabled = false;
  });
  document.addEventListener('submit', async function (event) {
    var form = event.target;
    if (!form.classList.contains('deliver-site')) return;
    event.preventDefault();
    var files = form.elements.site.files;
    if (!files.length) return;
    var button = form.querySelector('button');
    button.disabled = true;
    var response = await dropCVApi.deliverAdminSiteRequest(form.dataset.id, files, form.elements.note.value);
    document.getElementById('message').textContent = response.ok ? 'سایت نهایی برای مشتری منتشر شد.' : (response.error || 'آپلود سایت ممکن نشد.');
    if (response.ok) await load(); else button.disabled = false;
  });
  document.getElementById('refresh').addEventListener('click', load);
  document.getElementById('close-request-details').addEventListener('click', function () {
    document.getElementById('request-details').close();
  });
  setInterval(function () {
    if (pendingPaymentRows.length) renderPending(pendingPaymentRows);
  }, 60 * 1000);
  load();
})();
