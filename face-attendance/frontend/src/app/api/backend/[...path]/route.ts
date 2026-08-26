import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;

const UPSTREAM_TIMEOUT_MS = 140_000;
const MAX_PROXY_REQUEST_BYTES = 4_000_000;

const HOP_BY_HOP_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-encoding",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

function getBackendBaseUrl(): string {
  const configuredUrl = process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "");
  if (configuredUrl) {
    return configuredUrl;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_INTERNAL_URL is required in production");
  }
  return "http://127.0.0.1:8000";
}

function getBackendPath(request: NextRequest): string {
  const path = request.nextUrl.pathname.replace(/^\/api\/backend\/?/, "");
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");
}

function getProxyHeaders(sourceHeaders: Headers): Headers {
  const headers = new Headers();

  sourceHeaders.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(normalizedKey)) {
      headers.set(key, value);
    }
  });

  return headers;
}

function getProxyResponseHeaders(upstreamResponse: Response): Headers {
  const headers = getProxyHeaders(upstreamResponse.headers);
  headers.set("cache-control", "no-store");
  headers.set("pragma", "no-cache");
  headers.delete("set-cookie");
  for (const cookie of upstreamResponse.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return headers;
}

async function proxyBackendRequest(request: NextRequest): Promise<Response> {
  const backendPath = getBackendPath(request);
  const targetUrl = new URL(
    `${getBackendBaseUrl()}/${backendPath}${request.nextUrl.search}`,
  );
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let requestBody: ArrayBuffer | undefined;
  if (hasBody) {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_PROXY_REQUEST_BYTES) {
      return Response.json(
        { detail: "Request body is too large" },
        { status: 413 },
      );
    }
    requestBody = await request.arrayBuffer();
    if (requestBody.byteLength > MAX_PROXY_REQUEST_BYTES) {
      return Response.json(
        { detail: "Request body is too large" },
        { status: 413 },
      );
    }
  }

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: getProxyHeaders(request.headers),
    body: requestBody,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  // The Fetch Response constructor rejects a body for these statuses, even
  // when the upstream body is an empty ArrayBuffer. This matters for FastAPI
  // DELETE endpoints, which correctly return 204 No Content.
  const responseBody =
    request.method === "HEAD" || NULL_BODY_STATUSES.has(upstreamResponse.status)
      ? null
      : await upstreamResponse.arrayBuffer();

  return new Response(responseBody, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: getProxyResponseHeaders(upstreamResponse),
  });
}

async function safelyProxyBackendRequest(request: NextRequest): Promise<Response> {
  try {
    return await proxyBackendRequest(request);
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    console.error("Backend proxy request failed", {
      method: request.method,
      path: request.nextUrl.pathname,
      timedOut,
    });
    return Response.json(
      {
        detail: timedOut
          ? "The backend request timed out"
          : "The backend service is unavailable",
      },
      { status: timedOut ? 504 : 503 },
    );
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return safelyProxyBackendRequest(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return safelyProxyBackendRequest(request);
}

export async function PUT(request: NextRequest): Promise<Response> {
  return safelyProxyBackendRequest(request);
}

export async function PATCH(request: NextRequest): Promise<Response> {
  return safelyProxyBackendRequest(request);
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return safelyProxyBackendRequest(request);
}

export async function OPTIONS(request: NextRequest): Promise<Response> {
  return safelyProxyBackendRequest(request);
}
