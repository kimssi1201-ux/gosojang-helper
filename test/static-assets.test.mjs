import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function publicPath(file) {
  return path.join(root, "public", file.replace(/^\//, ""));
}

test("manifest is installable and all declared icons exist", async () => {
  const manifest = JSON.parse(await readFile(publicPath("manifest.webmanifest"), "utf8"));

  assert.equal(manifest.name, "고소장 도우미");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/?source=pwa");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));

  for (const icon of manifest.icons) {
    assert.equal(existsSync(publicPath(icon.src)), true, `${icon.src} must exist`);
  }
});

test("service worker app shell points only to existing local files", async () => {
  const source = await readFile(publicPath("sw.js"), "utf8");
  const matches = [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const appShellEntries = matches.filter((entry) => entry.startsWith("/"));

  assert.ok(appShellEntries.includes("/offline.html"));
  assert.ok(appShellEntries.includes("/manifest.webmanifest"));

  for (const entry of appShellEntries) {
    if (entry === "/") continue;
    if (entry.startsWith("/api/")) continue;
    const withoutQuery = entry.split("?")[0];
    assert.equal(existsSync(publicPath(withoutQuery)), true, `${entry} must exist`);
  }
});

test("index contains current AdSense and Open Graph thumbnail metadata", async () => {
  const html = await readFile(publicPath("index.html"), "utf8");

  assert.match(html, /ca-pub-5751319666030430/);
  assert.doesNotMatch(html, /ca-pub-8468106244002167/);
  assert.match(html, /https:\/\/seeyou\.kr\/og\.png/);
  assert.match(html, /summary_large_image/);
  assert.match(html, /<link rel="canonical" href="https:\/\/seeyou\.kr\/"/);
});

test("AdSense, robots, sitemap, and 404 files are valid", async () => {
  const ads = await readFile(publicPath("ads.txt"), "utf8");
  const robots = await readFile(publicPath("robots.txt"), "utf8");
  const sitemap = await readFile(publicPath("sitemap.xml"), "utf8");
  const notFound = await readFile(publicPath("404.html"), "utf8");

  assert.equal(ads.trim(), "google.com, pub-5751319666030430, DIRECT, f08c47fec0942fa0");
  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /Sitemap: https:\/\/seeyou\.kr\/sitemap\.xml/);
  assert.doesNotMatch(robots, /<html|<!doctype/i);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, /<loc>https:\/\/seeyou\.kr\/evidence-guide<\/loc>/);
  assert.doesNotMatch(sitemap, /<html|<!doctype/i);
  assert.match(notFound, /meta name="robots" content="noindex"/);
});

test("indexable pages use canonical URLs and provide useful original text", async () => {
  const pages = {
    "index.html": "https://seeyou.kr/",
    "write.html": "https://seeyou.kr/write",
    "guide.html": "https://seeyou.kr/guide",
    "examples.html": "https://seeyou.kr/examples",
    "checklist.html": "https://seeyou.kr/checklist",
    "glossary.html": "https://seeyou.kr/glossary",
    "evidence-guide.html": "https://seeyou.kr/evidence-guide",
    "filing-process.html": "https://seeyou.kr/filing-process",
    "about.html": "https://seeyou.kr/about",
    "privacy.html": "https://seeyou.kr/privacy",
    "terms.html": "https://seeyou.kr/terms",
  };

  for (const [file, canonical] of Object.entries(pages)) {
    const html = await readFile(publicPath(file), "utf8");
    const visibleText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.ok(visibleText.length >= 500, `${file} should contain substantial visible text`);
    assert.doesNotMatch(html, /href="\/[^"]+\.html/);
  }
});

test("privacy and terms pages contain complete trust disclosures", async () => {
  const privacy = await readFile(publicPath("privacy.html"), "utf8");
  const terms = await readFile(publicPath("terms.html"), "utf8");

  assert.match(privacy, /Google 광고와 쿠키/);
  assert.match(privacy, /쿠키.*IP 주소/s);
  assert.match(privacy, /policies\.google\.com\/technologies\/partner-sites/);
  assert.match(privacy, /외부 AI API/);
  assert.match(terms, /github\.com\/kimssi1201-ux\/gosojang-helper\/issues/);
  assert.doesNotMatch(terms, /출시 전|연결해야 합니다/);
});

test("required store thumbnail assets exist", () => {
  for (const file of [
    "og.png",
    "store/thumbnail-1200x630.png",
    "store/thumbnail-1932x828.png",
    "store/google-play-feature-1024x500.png",
  ]) {
    assert.equal(existsSync(publicPath(file)), true, `${file} must exist`);
  }
});
