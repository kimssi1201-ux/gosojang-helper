import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "../functions/api/draft.js";

function draftRequest(body, headers = {}) {
  return new Request("https://seeyou.kr/api/draft", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function readJson(response) {
  return response.json();
}

test("draft API returns fallback draft without OpenAI key", async () => {
  const response = await onRequestPost({
    request: draftRequest(JSON.stringify({
      caseTypeId: "fraud",
      caseTypeName: "사기",
      complainant: "홍길동",
      complainantPhone: "010-1111-2222",
      accused: "김철수",
      incidentDate: "2026년 7월 1일",
      incidentPlace: "중고거래 앱",
      story: "피고소인은 노트북을 보내겠다고 하고 50만원을 받았으나 물건을 보내지 않았습니다.",
      damage: "50만원",
      evidence: "카카오톡 대화, 계좌이체내역",
    })),
    env: {},
  });

  const data = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.usedAi, false);
  assert.match(data.draftText, /고소장|\[고소장\]/);
  assert.match(data.draftText, /홍길동/);
  assert.match(data.draftText, /주민등록번호: _+/);
  assert.match(data.draftText, /범죄사실/);
  assert.ok(Array.isArray(data.missingInfo));
  assert.ok(Array.isArray(data.precedentQueries));
});

test("draft API rejects invalid JSON", async () => {
  const response = await onRequestPost({
    request: draftRequest("{not-json"),
    env: {},
  });

  const data = await readJson(response);
  assert.equal(response.status, 400);
  assert.match(data.message, /요청 형식/);
});

test("draft API rejects oversized content-length before parsing", async () => {
  const response = await onRequestPost({
    request: draftRequest("{}", { "content-length": "120001" }),
    env: {},
  });

  const data = await readJson(response);
  assert.equal(response.status, 413);
  assert.match(data.message, /너무 깁니다/);
});

test("draft API trims allowed fields and drops unexpected fields", async () => {
  const response = await onRequestPost({
    request: draftRequest(JSON.stringify({
      complainant: "  홍길동  ",
      accused: "  김철수  ",
      story: "  피해 사실입니다.  ",
      damage: "1만원",
      admin: "SHOULD_NOT_APPEAR",
    })),
    env: {},
  });

  const data = await readJson(response);
  assert.equal(response.status, 200);
  assert.match(data.draftText, /홍길동/);
  assert.match(data.draftText, /김철수/);
  assert.doesNotMatch(data.draftText, /SHOULD_NOT_APPEAR/);
});

test("draft API uses mocked OpenAI response when API key is present", async (t) => {
  const originalFetch = globalThis.fetch;
  let called = false;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    called = true;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    return Response.json({
      output_text: JSON.stringify({
        purpose: "AI가 정리한 고소취지입니다.",
        facts: "가. 사건의 시작\n나. 피고소인의 구체적인 행위\n다. 고소인이 믿고 한 행동 또는 피해 발생 과정\n라. 피해 결과\n마. 증거자료와 확인 가능한 사실",
        reason: "AI가 정리한 고소이유입니다.",
        evidence: "AI가 정리한 증거자료입니다.",
        attachments: "AI가 정리한 첨부자료입니다.",
        cautions: "AI가 정리한 주의사항입니다.",
        missingInfo: ["AI 보완 항목"],
        precedentQueries: [{ label: "사기 송금 판례", url: "https://www.law.go.kr/precSc.do?query=%EC%82%AC%EA%B8%B0" }],
      }),
    });
  };

  const response = await onRequestPost({
    request: draftRequest(JSON.stringify({
      caseTypeId: "fraud",
      caseTypeName: "사기",
      complainant: "홍길동",
      accused: "김철수",
      story: "송금 후 물건을 받지 못했습니다.",
      damage: "50만원",
    })),
    env: { OPENAI_API_KEY: "test-key" },
  });

  const data = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(called, true);
  assert.equal(data.usedAi, true);
  assert.match(data.draftText, /AI가 정리한 고소취지입니다/);
  assert.deepEqual(data.precedentQueries, [{ label: "사기 송금 판례", url: "https://www.law.go.kr/precSc.do?query=%EC%82%AC%EA%B8%B0" }]);
});

test("draft API falls back when mocked OpenAI fails", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => Response.json({ error: { message: "mock failure" } }, { status: 500 });

  const response = await onRequestPost({
    request: draftRequest(JSON.stringify({
      complainant: "홍길동",
      accused: "김철수",
      story: "피해 사실입니다.",
      damage: "1만원",
    })),
    env: { OPENAI_API_KEY: "test-key" },
  });

  const data = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(data.usedAi, false);
  assert.match(data.message, /mock failure/);
  assert.match(data.draftText, /홍길동/);
});
