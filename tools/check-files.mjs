import { access, readFile } from "node:fs/promises";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/manifest.webmanifest",
  "public/sw.js",
  "public/offline.html",
  "public/terms.html",
  "public/icons/icon.svg",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/icon-maskable-512.png",
  "public/icons/apple-touch-icon.png",
  "public/og.png",
  "public/store/thumbnail-1200x630.png",
  "public/store/thumbnail-1932x828.png",
  "public/store/google-play-feature-1024x500.png",
  "functions/api/draft.js",
  "functions/api/cases.js",
];

for (const file of required) {
  await access(file);
}

const html = await readFile("public/index.html", "utf8");
if (!html.includes("고소장 도우미")) {
  throw new Error("index.html must include the app name.");
}

const manifest = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));
if (manifest.name !== "고소장 도우미" || manifest.display !== "standalone") {
  throw new Error("manifest.webmanifest must define the installable app.");
}

if (!manifest.icons.some((icon) => icon.purpose === "maskable")) {
  throw new Error("manifest.webmanifest must include a maskable icon.");
}

console.log("Project files look ready.");
