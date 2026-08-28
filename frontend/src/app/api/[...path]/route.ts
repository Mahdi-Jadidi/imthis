import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_PROXY_URL = (process.env.BACKEND_PROXY_URL || process.env.API_PROXY_URL || "")
  .trim()
  .replace(/\/$/, "");
const MAX_PROXY_REQUEST_BYTES = 60 * 1024 * 1024;

async function readLimitedBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_PROXY_REQUEST_BYTES) throw new RangeError("Request body too large");
  if (!request.body) return undefined;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROXY_REQUEST_BYTES) {
      await reader.cancel();
      throw new RangeError("Request body too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function filterRequestHeaders(headers: Headers) {
  const forwarded = new Headers();

  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "host"
      || lowerKey === "connection"
      || lowerKey === "content-length"
      || lowerKey === "accept-encoding"
      || lowerKey === "x-forwarded-host"
      || lowerKey === "x-forwarded-proto"
    ) {
      continue;
    }

    forwarded.set(key, value);
  }

  forwarded.set("bypass-tunnel-reminder", "1");
  return forwarded;
}

function copyResponseHeaders(sourceHeaders: Headers, responseHeaders: Headers) {
  const skipped = new Set([
    "connection",
    "content-length",
    "content-encoding",
    "transfer-encoding",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "upgrade",
  ]);

  for (const [key, value] of sourceHeaders.entries()) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "set-cookie" || skipped.has(lowerKey)) {
      continue;
    }

    responseHeaders.set(key, value);
  }

  const setCookieHeaders =
    typeof sourceHeaders.getSetCookie === "function"
      ? sourceHeaders.getSetCookie()
      : [];

  if (setCookieHeaders.length > 0) {
    for (const header of setCookieHeaders) {
      responseHeaders.append("Set-Cookie", header);
    }
    return;
  }

  const singleSetCookie = sourceHeaders.get("set-cookie");
  if (singleSetCookie) {
    responseHeaders.set("Set-Cookie", singleSetCookie);
  }
}

async function proxy(request: Request) {
  const incomingUrl = new URL(request.url);
  let pathname = incomingUrl.pathname;

  if (pathname === "/api/dropcv-api.js") {
    return Response.redirect(new URL("/dropcv-api.js", request.url), 302);
  }

  if (!BACKEND_PROXY_URL) {
    return Response.json({ error: "Missing BACKEND_PROXY_URL" }, { status: 500 });
  }

  if (pathname === "/proxy") {
    pathname = "/";
  } else if (pathname.startsWith("/proxy/")) {
    pathname = pathname.slice("/proxy".length);
  }

  const targetUrl = new URL(`${pathname}${incomingUrl.search}`, BACKEND_PROXY_URL);
  const requestInit: RequestInit = {
    method: request.method,
    headers: filterRequestHeaders(request.headers),
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
    try {
      requestInit.body = await readLimitedBody(request);
    } catch (error) {
      if (error instanceof RangeError) {
        return Response.json({ error: "Request body too large" }, { status: 413 });
      }
      throw error;
    }
  }

  const upstreamResponse = await fetch(targetUrl, { ...requestInit, signal: AbortSignal.timeout(65000) });
  const responseHeaders = new Headers();
  copyResponseHeaders(upstreamResponse.headers, responseHeaders);
  responseHeaders.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  responseHeaders.set("Pragma", "no-cache");
  responseHeaders.set("Expires", "0");
  responseHeaders.append("Vary", "Cookie");
  responseHeaders.append("Vary", "Authorization");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(request: Request) {
  return proxy(request);
}

export async function POST(request: Request) {
  return proxy(request);
}

export async function PUT(request: Request) {
  return proxy(request);
}

export async function PATCH(request: Request) {
  return proxy(request);
}

export async function DELETE(request: Request) {
  return proxy(request);
}

export async function OPTIONS(request: Request) {
  return proxy(request);
}

export async function HEAD(request: Request) {
  return proxy(request);
}
