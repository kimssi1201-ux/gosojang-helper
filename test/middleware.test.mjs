import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/_middleware.js";

function context(url, options = {}, response = new Response("ok")) {
  return {
    request: new Request(url, options),
    next: async () => response,
  };
}

test("middleware allows CORS preflight from production origin", async () => {
  const response = await onRequest(context("https://seeyou.kr/api/draft", {
    method: "OPTIONS",
    headers: { origin: "https://seeyou.kr" },
  }));

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://seeyou.kr");
});

test("middleware blocks CORS preflight from unknown origin", async () => {
  const response = await onRequest(context("https://seeyou.kr/api/draft", {
    method: "OPTIONS",
    headers: { origin: "https://evil.example" },
  }));

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("middleware adds security headers to normal responses", async () => {
  const response = await onRequest(context("https://seeyou.kr/"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("Permissions-Policy"), "geolocation=(), microphone=(), camera=()");
});

test("middleware sets PWA-specific headers", async () => {
  const sw = await onRequest(context("https://seeyou.kr/sw.js"));
  const manifest = await onRequest(context("https://seeyou.kr/manifest.webmanifest"));

  assert.equal(sw.headers.get("Cache-Control"), "no-cache");
  assert.equal(manifest.headers.get("Content-Type"), "application/manifest+json; charset=utf-8");
});
