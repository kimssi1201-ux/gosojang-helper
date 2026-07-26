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
