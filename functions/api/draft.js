const fallbackHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ message: "요청 형식이 올바르지 않습니다." }, 400);
  }

  if (!payload.story || !String(payload.story).trim()) {
    return json({ message: "사건 설명은 필수입니다." }, 400);
  }

  if (!env.OPENAI_API_KEY) {
    return json({
      usedAi: false,
      draftText: buildFallbackDraft(payload),
      missingInfo: findMissingInfo(payload),
      precedentQueries: buildPrecedentQueries(payload),
    });
  }

  try {
    const result = await callOpenAI(payload, env);
    return json({
      usedAi: true,
      draftText: formatDraft(result, payload),
      missingInfo: result.missingInfo || findMissingInfo(payload),
      precedentQueries: result.precedentQueries || buildPrecedentQueries(payload),
    });
  } catch (error) {
    return json({
      usedAi: false,
      message: `AI 호출에 실패했습니다: ${error.message}`,
      draftText: buildFallbackDraft(payload),
      missingInfo: findMissingInfo(payload),
      precedentQueries: buildPrecedentQueries(payload),
    });
  }
}

async function callOpenAI(payload, env) {
  const model = env.OPENAI_MODEL || "gpt-5.4-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "당신은 대한민국 형사 고소장 초안 작성 보조자입니다. 법률 자문이나 범죄 성립 단정을 하지 말고, 사용자가 입력한 사실관계를 문서 형식으로 정리하세요. 판례는 실제 사건번호를 지어내지 말고 검색 키워드와 공식 검색 링크만 제안하세요.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              instruction:
                "아래 입력을 바탕으로 형사 고소장 초안을 작성하세요. 감정적 표현은 줄이고, 시간순 사실관계와 증거를 분리하세요.",
              payload,
            },
            null,
            2,
          ),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "criminal_complaint_draft",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "purpose",
              "facts",
              "reason",
              "evidence",
              "attachments",
              "cautions",
              "missingInfo",
              "precedentQueries",
            ],
            properties: {
              purpose: { type: "string" },
              facts: { type: "string" },
              reason: { type: "string" },
              evidence: { type: "string" },
              attachments: { type: "string" },
              cautions: { type: "string" },
              missingInfo: {
                type: "array",
                items: { type: "string" },
              },
              precedentQueries: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "url"],
                  properties: {
                    label: { type: "string" },
                    url: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI API 오류");
  }

  const text = data.output_text || extractOutputText(data);
  if (!text) {
    throw new Error("AI 응답에서 텍스트를 찾지 못했습니다.");
  }

  return JSON.parse(text);
}

function extractOutputText(data) {
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (part.type === "output_text" && part.text) return part.text;
      if (part.type === "text" && part.text) return part.text;
    }
  }
  return "";
}

function formatDraft(result, payload) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return [
    "고 소 장",
    "",
    "1. 고소인",
    payload.complainant || "[고소인 성명, 주소, 연락처 기재]",
    "",
    "2. 피고소인",
    payload.accused || "[피고소인 성명, 주소, 연락처 또는 성명불상 기재]",
    "",
    "3. 고소취지",
    result.purpose,
    "",
    "4. 범죄사실",
    result.facts,
    "",
    "5. 고소이유",
    result.reason,
    "",
    "6. 증거자료",
    result.evidence,
    "",
    "7. 첨부서류",
    result.attachments,
    "",
    "8. 유의사항",
    result.cautions,
    "",
    `${today}`,
    "",
    "고소인: ____________________ (서명 또는 인)",
  ].join("\n");
}

function buildFallbackDraft(payload) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return [
    "고 소 장",
    "",
    "1. 고소인",
    payload.complainant || "[고소인 성명, 주소, 연락처 기재]",
    "",
    "2. 피고소인",
    payload.accused || "[피고소인 성명, 주소, 연락처 또는 성명불상 기재]",
    "",
    "3. 고소취지",
    `고소인은 피고소인을 ${payload.caseTypeName || "관련 범죄"} 혐의로 고소하오니, 철저히 수사하여 법에 따라 처벌하여 주시기 바랍니다.`,
    "",
    "4. 범죄사실",
    `가. 사건 일시: ${payload.incidentDate || "[일시 기재]"}`,
    `나. 사건 장소: ${payload.incidentPlace || "[장소 기재]"}`,
    `다. 피해 내용: ${payload.damage || "[피해금액 또는 피해내용 기재]"}`,
    "",
    payload.story,
    "",
    "5. 고소이유",
    `위 사실관계는 ${payload.caseTypeName || "형사사건"} 쟁점과 관련될 수 있으므로, 고소인은 수사기관의 판단을 구하고자 본 고소장을 제출합니다.`,
    "",
    "6. 증거자료",
    payload.evidence || "[문자, 카카오톡, 계좌이체내역, 사진, 진단서, 녹취, CCTV 등]",
    "",
    "7. 첨부서류",
    "가. 증거자료 사본 각 1부",
    "나. 신분증 사본 1부",
    "다. 기타 피해 사실을 확인할 수 있는 자료",
    "",
    "8. 유의사항",
    "본 문서는 사용자가 입력한 사실관계를 바탕으로 작성한 초안이며 법률 자문이 아닙니다. 제출 전 변호사 또는 수사기관 상담을 권장합니다.",
    "",
    `${today}`,
    "",
    "고소인: ____________________ (서명 또는 인)",
  ].join("\n");
}

function findMissingInfo(payload) {
  const checks = [
    ["complainant", "고소인 인적사항"],
    ["accused", "피고소인 인적사항 또는 성명불상 사유"],
    ["incidentDate", "사건 일시"],
    ["incidentPlace", "사건 장소"],
    ["damage", "피해금액 또는 피해내용"],
    ["evidence", "증거자료"],
    ["story", "시간순 사건 설명"],
  ];

  const missing = checks
    .filter(([key]) => !String(payload[key] || "").trim())
    .map(([, label]) => label);

  return missing.length ? missing : ["현재 입력 기준으로 핵심 항목은 채워져 있습니다."];
}

function buildPrecedentQueries(payload) {
  const keywords = Array.isArray(payload.lawKeywords) && payload.lawKeywords.length
    ? payload.lawKeywords
    : [payload.caseTypeName || "형사"];

  return keywords.map((keyword) => {
    const label = `${payload.caseTypeName || "형사"} ${keyword}`;
    return {
      label,
      url: `https://www.law.go.kr/precSc.do?query=${encodeURIComponent(label)}`,
    };
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: fallbackHeaders,
  });
}
