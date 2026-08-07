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

test("middleware redirects duplicate production hosts to the canonical domain", async () => {
  for (const url of [
    "https://www.seeyou.kr/guide?from=www",
    "https://gosojang-helper.pages.dev/examples",
  ]) {
    const response = await onRequest(context(url));
    const source = new URL(url);

    assert.equal(response.status, 308);
    assert.equal(
      response.headers.get("Location"),
      `https://seeyou.kr${source.pathname}${source.search}`,
    );
  }
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

test("middleware sets crawler file content types", async () => {
  const ads = await onRequest(context("https://seeyou.kr/ads.txt"));
  const robots = await onRequest(context("https://seeyou.kr/robots.txt"));
  const sitemap = await onRequest(context("https://seeyou.kr/sitemap.xml"));

  assert.equal(ads.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.equal(robots.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.equal(sitemap.headers.get("Content-Type"), "application/xml; charset=utf-8");
});
