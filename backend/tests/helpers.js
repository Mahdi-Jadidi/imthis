const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function request(method, path, body, cookies, extraHeaders) {
  try {
    const headers = { ...(extraHeaders || {}) };

    if (body !== undefined && body !== null) {
      headers['Content-Type'] = 'application/json';
    }

    if (cookies) {
      headers.Cookie = cookies;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    });

    let parsedBody = null;
    const responseText = await response.text();

    if (responseText) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch (error) {
        parsedBody = responseText;
      }
    }

    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    const cookieString = setCookieHeaders
      .map((header) => header.split(';')[0])
      .filter(Boolean)
      .join('; ');

    return {
      status: response.status,
      body: parsedBody,
      cookies: cookieString || null,
      headers: Object.fromEntries(response.headers.entries()),
      setCookieHeaders,
    };
  } catch (err) {
    return {
      status: 0,
      body: null,
      error: err.message,
      cookies: null,
      headers: {},
      setCookieHeaders: [],
    };
  }
}

async function uploadFile(path, fieldName, filename, content, mimetype, cookies) {
  return uploadMultipart(path, [
    {
      type: 'file',
      fieldName,
      filename,
      content,
      mimetype,
    },
  ], cookies);
}

async function uploadMultipart(path, parts, cookies) {
  try {
    const boundary = `----TestBoundary${Date.now()}`;
    const bodyParts = [];

    for (const part of parts) {
      if (!part) continue;

      if (part.type === 'field') {
        bodyParts.push(Buffer.from([
          `--${boundary}`,
          `Content-Disposition: form-data; name="${part.fieldName || part.name}"`,
          '',
          String(part.value == null ? '' : part.value),
        ].join('\r\n') + '\r\n'));
        continue;
      }

      const payload = Buffer.isBuffer(part.content) ? part.content : Buffer.from(String(part.content));
      const fieldName = part.fieldName || part.name;
      const headers = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="${fieldName}"; filename="${part.filename}"`,
        `Content-Type: ${part.mimetype || 'application/octet-stream'}`,
        '',
      ];

      bodyParts.push(Buffer.from(headers.join('\r\n') + '\r\n'));
      bodyParts.push(payload);
      bodyParts.push(Buffer.from('\r\n'));
    }

    bodyParts.push(Buffer.from(`--${boundary}--`));
    const body = Buffer.concat(bodyParts);

    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Cookie: cookies || '',
        'Content-Length': body.length.toString(),
      },
      body,
    });

    const responseBody = await response.json().catch(() => null);
    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    const cookieString = setCookieHeaders
      .map((header) => header.split(';')[0])
      .filter(Boolean)
      .join('; ');

    return {
      status: response.status,
      body: responseBody,
      cookies: cookieString || null,
      headers: Object.fromEntries(response.headers.entries()),
      setCookieHeaders,
    };
  } catch (err) {
    return {
      status: 0,
      body: null,
      error: err.message,
      cookies: null,
      headers: {},
      setCookieHeaders: [],
    };
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertStatus(response, expected, testName) {
  if (response.status !== expected) {
    throw new Error(
      `${testName}: Expected status ${expected}, got ${response.status}. Body: ${JSON.stringify(response.body)}`,
    );
  }
}

function assertField(obj, field, testName) {
  if (obj[field] === undefined || obj[field] === null) {
    throw new Error(
      `${testName}: Expected field "${field}" to exist in response. Got: ${JSON.stringify(obj)}`,
    );
  }
}

module.exports = {
  BASE_URL,
  request,
  uploadFile,
  uploadMultipart,
  assert,
  assertStatus,
  assertField,
};
