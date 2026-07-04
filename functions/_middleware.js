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
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
