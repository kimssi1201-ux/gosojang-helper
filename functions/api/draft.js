const fallbackHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

const factSectionTitles = [
  "가. 피고소인 특정",
  "나. 고소인과 피고소인의 관계 및 사건 경위",
  "다. 범행 일시와 장소",
  "라. 범행 방법과 구체적 행위",
  "마. 피해 결과",
  "바. 증거와 연결되는 사실",
  "사. 범죄유형 및 보충 사정",
];

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
      draftText: buildComplaintDraft(payload),
      missingInfo: findMissingInfo(payload),
      precedentQueries: buildPrecedentQueries(payload),
    });
  }

  try {
    const result = await callOpenAI(payload, env);
    return json({
      usedAi: true,
      draftText: buildComplaintDraft(payload, result),
      missingInfo: result.missingInfo || findMissingInfo(payload),
      precedentQueries: result.precedentQueries || buildPrecedentQueries(payload),
    });
  } catch (error) {
    return json({
      usedAi: false,
      message: `초안 정리에 실패했습니다: ${error.message}`,
      draftText: buildComplaintDraft(payload),
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
            "당신은 대한민국 형사 고소장 초안 작성 보조자입니다. 검찰 고소장 표준서식과 검찰사건사무규칙의 사건 접수 실무 흐름을 기준으로 문서를 정리합니다. 법률 자문, 유죄 단정, 과장, 없는 사실 창작은 금지합니다. 사용자가 입력한 사실만 바탕으로, 수사관이 바로 읽을 수 있게 일시, 장소, 상대방 특정, 행위, 피해, 증거 연결을 구체적으로 정리하세요. 모르는 정보는 단정하지 말고 [직접 기재] 또는 [확인 필요]로 남기세요. 판례 사건번호는 만들지 말고 공식 검색 키워드만 제안하세요.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              instruction:
                "아래 입력을 바탕으로 실제 제출용 고소장 초안을 작성하세요. 반드시 고소취지, 범죄사실, 고소이유, 증거자료, 별지 증거목록, 제출 전 확인사항을 작성합니다. 범죄사실은 다음 소제목을 빠짐없이 포함하세요: 가. 피고소인 특정 / 나. 고소인과 피고소인의 관계 및 사건 경위 / 다. 범행 일시와 장소 / 라. 범행 방법과 구체적 행위 / 마. 피해 결과 / 바. 증거와 연결되는 사실 / 사. 범죄유형 및 보충 사정. 범죄사실은 짧은 메모가 아니라 문단형으로 작성하고, 사용자가 적은 사건 설명을 시간순으로 풀어 쓰세요. 증거자료는 각 증거가 무엇을 입증하는지 연결해서 적으세요.",
              caseTypeRequirements: getCaseTypeRequirements(payload),
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
              missingInfo: { type: "array", items: { type: "string" } },
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
  if (!text) throw new Error("응답에서 초안 내용을 찾지 못했습니다.");
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

function buildComplaintDraft(payload, ai = {}) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const evidenceItems = splitEvidence(payload.evidence);
  const facts = normalizeFactSection(ai.facts) || buildFactSection(payload, evidenceItems);

  return [
    "고 소 장",
    "",
    "1. 고소인*",
    `성명: ${valueOr(payload.complainant, "[고소인 성명]")}`,
    "주민등록번호: [제출 전 직접 기재]",
    `주소: ${valueOr(payload.complainantAddress, "[주소]")}`,
    "직업: [직업]",
    `전화: ${valueOr(payload.complainantPhone, "[연락처]")}`,
    "이메일: [이메일]",
    "대리인에 의한 고소: ☑ 해당 없음  □ 법정대리인  □ 고소대리인",
    "",
    "2. 피고소인*",
    `성명: ${valueOr(payload.accused, "[피고소인 성명 또는 성명불상]")}`,
    "주민등록번호: [알고 있는 경우 제출 전 직접 기재]",
    `주소: ${valueOr(payload.accusedAddress, "[주소 또는 알 수 없는 사유]")}`,
    "직업: [직업]",
    `전화: ${valueOr(payload.accusedContact, "[연락처 또는 계정]")}`,
    "이메일: [이메일]",
    "기타사항: [고소인과의 관계, 인상착의, 계정명, 계좌번호 등 특정 단서]",
    "",
    "3. 고소취지*",
    ai.purpose || buildPurpose(payload),
    "",
    "4. 범죄사실*",
    facts,
    "",
    "5. 고소이유",
    ai.reason || buildReasonSection(payload, evidenceItems),
    "",
    "6. 증거자료",
    evidenceItems.length
      ? "☑ 고소인은 고소인의 진술 외에 제출할 증거가 있습니다."
      : "□ 고소인은 고소인의 진술 외에 제출할 증거가 없습니다.",
    ai.evidence || buildEvidenceSection(evidenceItems),
    "",
    "7. 관련사건의 수사 및 재판 여부*",
    "① 중복 고소 여부: □ 있습니다 / ☑ 없습니다 / □ 확인 필요",
    "② 관련 형사사건 수사 유무: □ 수사 중에 있습니다 / ☑ 수사 중에 있지 않습니다 / □ 확인 필요",
    "③ 관련 민사소송 유무: □ 민사소송 중에 있습니다 / ☑ 민사소송 중에 있지 않습니다 / □ 확인 필요",
    "기타사항: [관련 사건이 있으면 검찰청, 경찰서, 법원, 사건번호, 진행 상태를 기재]",
    "",
    "8. 기타",
    "본 고소장에 기재한 내용은 고소인이 알고 있는 지식과 경험을 바탕으로 모두 사실대로 작성하였으며, 만일 허위사실을 고소하였을 때에는 형법 제156조 무고죄로 처벌받을 것임을 확인합니다.",
    "",
    today,
    "",
    "고소인: ____________________ (인)",
    "제출인: ____________________ (인)",
    "",
    ai.attachments || buildAttachmentList(evidenceItems),
    "",
    ai.cautions || buildCautions(payload, evidenceItems),
  ].join("\n");
}

function normalizeFactSection(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return factSectionTitles.every((title) => text.includes(title)) ? text : "";
}

function buildPurpose(payload) {
  const accused = valueOr(payload.accused, "피고소인");
  const caseType = valueOr(payload.caseTypeName, "관련 범죄");
  return `고소인은 피고소인 ${accused}을(를) ${caseType} 혐의로 고소하오니, 아래 범죄사실과 증거자료를 토대로 철저히 수사하여 법에 따라 처벌하여 주시기 바랍니다.`;
}

function buildFactSection(payload, evidenceItems) {
  const accusedName = valueOr(payload.accused, "[피고소인 성명 또는 성명불상]");
  const accusedDetails = [
    payload.accusedContact && `연락처/계정: ${payload.accusedContact}`,
    payload.accusedAddress && `주소/단서: ${payload.accusedAddress}`,
  ].filter(Boolean);
  const accusedLine = accusedDetails.length
    ? `피고소인은 ${accusedName}(${accusedDetails.join(", ")})입니다.`
    : `피고소인은 ${accusedName}입니다.`;
  const unknownLine = /성명불상|미상|모름|불상/u.test(accusedName)
    ? "현재 피고소인의 정확한 인적사항 전부를 알 수는 없으나, 위 연락처·계정·주소 단서, 대화내역, 송금내역 등으로 피고소인을 특정할 수 있을 것으로 보입니다."
    : "";
  const checkedLine = Array.isArray(payload.checkedQuestions) && payload.checkedQuestions.length
    ? payload.checkedQuestions.join(" / ")
    : "[해당되는 추가 확인 질문을 체크하면 이 부분에 반영됩니다]";
  const requirements = getCaseTypeRequirements(payload).join(" / ");

  return [
    "가. 피고소인 특정",
    accusedLine,
    unknownLine,
    "",
    "나. 고소인과 피고소인의 관계 및 사건 경위",
    `고소인은 ${valueOr(payload.incidentDate, "[일시 확인 필요]")} 전후로 피고소인과 이 사건과 관련하여 연락하거나 거래하였고, 그 과정에서 아래와 같은 피해를 입었습니다. 고소인과 피고소인의 구체적인 관계, 처음 연락하게 된 경위, 거래 또는 다툼이 시작된 이유는 제출 전 보완하여 기재합니다.`,
    "",
    "다. 범행 일시와 장소",
    `피고소인은 ${valueOr(payload.incidentDate, "[일시 기재]")}, ${valueOr(payload.incidentPlace, "[장소 기재]")}에서 이 사건 행위를 하였습니다. 정확한 시각이나 장소가 일부 불명확한 경우에는 대화내역, 통화기록, 송금내역, CCTV 등으로 확인 가능한 범위를 기준으로 특정합니다.`,
    "",
    "라. 범행 방법과 구체적 행위",
    sentenceOrPlaceholder(payload.story, "[피고소인이 한 말, 보낸 메시지, 받은 돈이나 물건, 폭행·협박·게시 행위 등 구체적인 행동을 시간순으로 기재]"),
    "",
    "마. 피해 결과",
    `그 결과 고소인은 ${valueOr(payload.damage, "[피해금액 또는 피해내용 기재]")}의 피해를 입었습니다. 피해가 금전 피해인 경우 송금일, 금액, 계좌, 변제 여부를 함께 적고, 신체·명예·업무상 피해인 경우 진단서, 게시물, 업무 중단 자료 등으로 피해 결과를 보완합니다.`,
    "",
    "바. 증거와 연결되는 사실",
    evidenceItems.length
      ? `고소인은 ${evidenceItems.join(", ")} 자료를 제출할 예정입니다. 위 자료는 피고소인의 말이나 행동, 금전 또는 물건의 이동, 피해 발생 시점, 피해 결과를 확인하기 위한 자료입니다.`
      : "현재 제출할 증거자료가 구체적으로 정리되지 않았습니다. 문자, 카카오톡, 계좌이체내역, 사진, 진단서, 녹취, CCTV 등 사건을 뒷받침할 자료를 제출 전 정리합니다.",
    "",
    "사. 범죄유형 및 보충 사정",
    `이 사건은 ${valueOr(payload.caseTypeName, "[범죄유형]")} 혐의와 관련된 사실로 정리됩니다. 이 유형에서 특히 확인할 내용은 ${requirements}입니다. 추가 확인 항목은 ${checkedLine}입니다.`,
  ].filter((line) => line !== "").join("\n");
}

function buildReasonSection(payload, evidenceItems) {
  const caseType = valueOr(payload.caseTypeName, "형사사건");
  const damage = valueOr(payload.damage, "피해");
  const evidenceText = evidenceItems.length ? `또한 ${evidenceItems.join(", ")} 등 객관자료가 있어` : "관련 자료를 추가로 정리하여";

  return [
    `피고소인의 위 행위는 ${caseType} 혐의와 관련될 수 있고, 고소인은 이 사건으로 ${damage}를 입었습니다.`,
    `고소인은 피고소인의 구체적인 말과 행동, 피해 발생 경위, 피해 결과를 사실 중심으로 정리하여 제출합니다. ${evidenceText} 수사기관에서 사실관계를 확인할 수 있을 것으로 보입니다.`,
    "따라서 피고소인을 조사하고, 필요한 경우 계좌내역, 통신내역, CCTV, 플랫폼 기록, 참고인 진술 등을 확인하여 법에 따라 처리하여 주시기 바랍니다.",
  ].join("\n");
}

function buildEvidenceSection(evidenceItems) {
  if (!evidenceItems.length) {
    return "증거자료: [문자, 카카오톡, 계좌이체내역, 사진, 진단서, 녹취, CCTV 등]\n입증하려는 내용: [피고소인의 말과 행동, 금전 이동, 피해 발생, 피해 결과를 어떤 자료로 확인할 수 있는지 기재]";
  }

  return evidenceItems
    .map((item, index) => `${index + 1}. ${item}: [이 자료로 확인되는 날짜, 상대방, 금액, 대화 내용, 피해 결과 등을 기재]`)
    .join("\n");
}

function buildAttachmentList(evidenceItems) {
  const documentRows = evidenceItems.length
    ? evidenceItems.map((item, index) => `${index + 1}) ${item} / 작성자 또는 보관자: [직접 기재] / 입증하려는 내용: [직접 기재] / 제출 유무: ☑ 접수시 제출 □ 수사 중 제출`)
    : ["1) [증거명] / 작성자 또는 보관자: [직접 기재] / 입증하려는 내용: [직접 기재] / 제출 유무: □ 접수시 제출 □ 수사 중 제출"];

  return [
    "[별지] 증거자료 세부 목록",
    "",
    "1. 인적증거 (목격자, 참고인 등)",
    "성명: [참고인 성명] / 연락처: [연락처] / 고소인과의 관계: [관계] / 입증하려는 내용: [무엇을 보았거나 알고 있는지]",
    "",
    "2. 증거서류·사진·전자자료",
    ...documentRows,
    "",
    "3. 증거물",
    "1) [증거물] / 소유자 또는 보관자: [소유자] / 입증하려는 내용: [직접 기재] / 제출 유무: □ 접수시 제출 □ 수사 중 제출",
    "",
    "4. 기타 증거",
    "[수사기관이 확보할 필요가 있는 CCTV 위치, 플랫폼 기록, 통신기록, 계좌 추적 필요성 등을 기재]",
  ].join("\n");
}

function buildCautions(payload, evidenceItems) {
  const missing = findMissingInfo(payload).filter((item) => item !== "현재 입력 기준으로 핵심 항목은 채워져 있습니다.");
  const lines = ["제출 전 확인사항"];
  if (missing.length) lines.push(`- 보완 필요: ${missing.join(", ")}`);
  if (!evidenceItems.length) lines.push("- 증거자료 목록과 실제 첨부자료를 반드시 맞춰 주세요.");
  lines.push("- 확실하지 않은 내용은 단정하지 말고 '[확인 필요]'로 남겨 주세요.");
  lines.push("- 주민등록번호, 서명, 제출일, 관할 경찰서 또는 검찰청은 제출 직전에 직접 확인해 주세요.");
  return lines.join("\n");
}

function getCaseTypeRequirements(payload) {
  const id = payload.caseTypeId || "";
  const byType = {
    fraud: ["상대방이 한 구체적인 거짓말", "그 말을 믿고 돈이나 물건을 넘긴 경위", "송금일·금액·계좌", "처음부터 이행 의사나 능력이 없었다고 볼 사정"],
    assault: ["폭행 또는 상해 방법", "맞은 부위와 횟수", "상처 사진·진단서·치료내역", "목격자나 CCTV 위치"],
    threat: ["상대방이 한 해악 고지의 원문", "요구한 돈이나 행동", "불안·공포를 느낀 사정", "문자·녹취·통화기록"],
    defamation: ["문제 표현의 원문", "게시 위치와 공개 범위", "고소인이 특정되는 이유", "캡처·URL·작성자 계정"],
    embezzlement: ["돈이나 물건을 맡긴 이유", "보관자 또는 업무상 지위", "정해진 용도와 다른 사용", "손해액과 회계자료"],
    stalking: ["반복 연락·접근의 날짜와 횟수", "거부 의사 표시", "불안감 또는 생활상 피해", "통화기록·메시지·CCTV"],
    cyber: ["서비스명·URL·계정", "피싱 링크 또는 접속 경위", "결제·송금·계정 탈취 피해", "화면 캡처와 접속기록"],
    business: ["방해된 업무의 내용", "위계 또는 위력의 구체적인 방법", "업무 중단이나 손해", "매출자료·민원기록·녹취"],
  };
  return byType[id] || ["상대방의 구체적인 말과 행동", "피해 발생 경위", "피해 결과", "이를 뒷받침할 증거"];
}

function splitEvidence(value) {
  return String(value || "")
    .split(/[,，、\/\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function findMissingInfo(payload) {
  const checks = [
    ["complainant", "고소인 성명"],
    ["complainantPhone", "고소인 연락처"],
    ["accused", "피고소인 성명 또는 성명불상 사유"],
    ["accusedContact", "피고소인 연락처·계정 또는 특정 단서"],
    ["incidentDate", "사건 일시"],
    ["incidentPlace", "사건 장소"],
    ["damage", "피해금액 또는 피해내용"],
    ["evidence", "증거자료"],
    ["story", "범죄사실 설명"],
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

function sentenceOrPlaceholder(value, placeholder) {
  const text = String(value || "").trim();
  if (!text) return placeholder;
  return /[.!?。다요음]$/u.test(text) ? text : `${text}`;
}

function valueOr(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: fallbackHeaders,
  });
}
