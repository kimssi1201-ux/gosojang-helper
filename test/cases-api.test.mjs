import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet } from "../functions/api/cases.js";

test("cases API returns supported case names", async () => {
  const response = await onRequestGet();
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data.cases));
  assert.ok(data.cases.includes("사기"));
  assert.ok(data.cases.includes("사이버범죄"));
  assert.equal(data.source, "고소장 도우미 MVP");
});
