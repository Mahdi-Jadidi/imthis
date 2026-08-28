const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter;

function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
      // Reuse the SMTP connection on warm server instances so verification
      // requests do not pay a fresh TLS/auth handshake every time.
      pool: true,
      maxConnections: 2,
      maxMessages: 100,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const client = getTransporter();
  if (!client) {
    const error = new Error('Email delivery is not configured');
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }
  return client.sendMail({ from: env.smtp.from, to, subject, text, html });
}

async function sendPublicationConfirmation({ email, url, plan, expiresAt, referenceId }) {
  const publicUrl = /^https?:\/\//i.test(String(url || '')) ? String(url) : `https://${url}`;
  return sendMail({
    to: email,
    subject: 'وب‌سایت I’m This شما منتشر شد',
    text: `Your ${plan} site is live at ${url}. Payment reference: ${referenceId}. Active until ${expiresAt}.`,
    html: `<p>وب‌سایت شما منتشر شد.</p><p><a href="${publicUrl}">${publicUrl}</a></p><p>کد پیگیری: ${referenceId}</p>`,
  });
}

async function sendExpirationNotice({ email, url }) {
  return sendMail({
    to: email,
    subject: 'اشتراک I’m This شما منقضی شد',
    text: `Your I’m This subscription for ${url} has expired. Your draft remains available after login.`,
  });
}

async function sendRenewalReminder({ email, url, expiresAt }) {
  return sendMail({
    to: email,
    subject: 'یادآوری تمدید اشتراک I’m This',
    text: `Your I’m This subscription for ${url} expires on ${expiresAt}. Log in to renew and keep it online.`,
  });
}

async function sendTrialEndingReminder({ email, url, expiresAt }) {
  return sendMail({
    to: email,
    subject: 'Trial ends tomorrow on I’m This',
    text: `Your free I’m This trial for ${url} ends on ${expiresAt}. Your site will go offline, and the name stays reserved for one more day before the site and name are removed.`,
  });
}

async function sendVerificationCode({ email, code }) {
  return sendMail({
    to: email,
    subject: 'کد تأیید ایمیل I’m This',
    text: `Your I’m This verification code is ${code}. It expires in 30 minutes.`,
    html: `<p>کد تأیید ایمیل شما:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>این کد تا ۳۰ دقیقه معتبر است.</p>`,
  });
}

async function sendEmailChangeConfirmation({ email, confirmationUrl }) {
  return sendMail({
    to: email,
    subject: 'Confirm your new I’m This email',
    text: `Confirm this email address within one hour: ${confirmationUrl}`,
    html: `<p>Confirm this email address within one hour:</p><p><a href="${confirmationUrl}">${confirmationUrl}</a></p>`,
  });
}

async function sendSiteDeliveryNotice({ email, url, trialEndsAt }) {
  const publicUrl = /^https?:\/\//i.test(String(url || '')) ? String(url) : `https://${url}`;
  return sendMail({
    to: email,
    subject: 'سایت I’m This شما آماده است',
    text: `Your I’m This site is ready at ${publicUrl}. Your three-day trial ends on ${trialEndsAt}.`,
    html: `<p>سایت شخصی شما آماده است.</p><p><a href="${publicUrl}">${publicUrl}</a></p><p>آزمایش سه‌روزه شما تا ${trialEndsAt} فعال است.</p>`,
  });
}

module.exports = {
  sendMail,
  sendVerificationCode,
  sendPublicationConfirmation,
  sendExpirationNotice,
  sendRenewalReminder,
  sendTrialEndingReminder,
  sendEmailChangeConfirmation,
  sendSiteDeliveryNotice,
};
