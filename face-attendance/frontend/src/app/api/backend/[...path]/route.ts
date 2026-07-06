import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
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

function getBackendBaseUrl(): string {
  return (
    process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8002"
  );
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

async function proxyBackendRequest(request: NextRequest): Promise<Response> {
  const backendPath = getBackendPath(request);
  const targetUrl = new URL(
    `${getBackendBaseUrl()}/${backendPath}${request.nextUrl.search}`,
  );
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: getProxyHeaders(request.headers),
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: getProxyHeaders(upstreamResponse.headers),
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  return proxyBackendRequest(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return proxyBackendRequest(request);
}

export async function PUT(request: NextRequest): Promise<Response> {
  return proxyBackendRequest(request);
}

export async function PATCH(request: NextRequest): Promise<Response> {
  return proxyBackendRequest(request);
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return proxyBackendRequest(request);
}

export async function OPTIONS(request: NextRequest): Promise<Response> {
  return proxyBackendRequest(request);
}
