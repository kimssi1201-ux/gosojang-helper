import { access, readFile } from "node:fs/promises";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
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

console.log("Project files look ready.");
