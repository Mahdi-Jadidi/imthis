const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const requestedEnvFile = process.env.ENV_FILE;
const envFileCandidates = requestedEnvFile ? [requestedEnvFile] : ['.env.local', '.env'];

for (const candidate of envFileCandidates) {
  const fullPath = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(process.cwd(), candidate);

  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
    break;
  }
}

const requiredEnvVars = [
  'NODE_ENV',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'MINIO_ENDPOINT',
  'MINIO_PORT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
  'FRONTEND_URL',
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  trustProxy: process.env.TRUST_PROXY === 'true'
    ? true
    : (process.env.TRUST_PROXY === 'false' || !process.env.TRUST_PROXY
      ? false
      : (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY)),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  minio: {
    endPoint: process.env.MINIO_ENDPOINT,
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    bucket: process.env.MINIO_BUCKET,
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  siteGenerationApiUrl: process.env.SITE_GENERATION_API_URL || '',
  siteGenerationApiKey: process.env.SITE_GENERATION_API_KEY || '',
  aiSiteGenerationEnabled: process.env.AI_SITE_GENERATION_ENABLED === 'true',
  frontendUrl: process.env.FRONTEND_URL,
  // Leave unset for a host-only cookie. Never use .imthis.site: customer
  // subdomains must not receive or share the API authentication boundary.
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  trustedFrontendOrigins: (process.env.TRUSTED_FRONTEND_ORIGINS || process.env.FRONTEND_URL)
    .split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean),
  backendUrl: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`,
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
  cronSecret: process.env.CRON_SECRET || '',
  manualPayment: {
    cardNumber: (process.env.MANUAL_PAYMENT_CARD_NUMBER || '').replace(/\s+/g, ''),
    cardHolder: process.env.MANUAL_PAYMENT_CARD_HOLDER || '',
    bankName: process.env.MANUAL_PAYMENT_BANK_NAME || '',
  },
  zarinpal: {
    merchantId: process.env.ZARINPAL_MERCHANT_ID || '',
    sandbox: process.env.ZARINPAL_SANDBOX === 'true',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || "I'm This <noreply@imthis.site>",
  },
};

module.exports = env;
