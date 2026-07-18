const allowedOrigins = new Set([
  "https://seeyou.kr",
  "https://www.seeyou.kr",
  "https://gosojang-helper.pages.dev",
]);

function corsHeadersFor(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  });
  if (allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export async function onRequest(context) {
  const corsHeaders = corsHeadersFor(context.request);
  if (context.request.method === "OPTIONS") {
    if (!corsHeaders.has("Access-Control-Allow-Origin")) {
      return new Response(null, { status: 403, headers: corsHeaders });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  const url = new URL(context.request.url);
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  if (url.pathname === "/sw.js") {
    headers.set("Cache-Control", "no-cache");
  }
  if (url.pathname === "/manifest.webmanifest") {
    headers.set("Content-Type", "application/manifest+json; charset=utf-8");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
