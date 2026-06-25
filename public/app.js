const $ = (selector) => document.querySelector(selector);

const form = $("#complaintForm");
const grid = $("#caseTypeGrid");
const questions = $("#dynamicQuestions");
const editor = $("#draftEditor");
const statusText = $("#statusText");
const missingList = $("#missingList");
const precedentList = $("#precedentList");

const controls = {
  generate: $("#generateBtn"),
  template: $("#templateBtn"),
  copy: $("#copyBtn"),
  clear: $("#clearBtn"),
  txt: $("#downloadTxtBtn"),
  print: $("#printBtn"),
};

let caseTypes = [];
let selectedCaseType = "fraud";

const fallbackCaseTypes = [
  {
    id: "fraud",
    name: "사기",
    summary: "돈, 물품, 투자, 계약 관련 기망 피해",
    lawKeywords: ["기망행위", "처분행위", "변제의사", "편취"],
    questions: [
      "상대방이 어떤 말이나 자료로 믿게 만들었나요?",
      "돈이나 재산을 넘긴 날짜와 방법은 무엇인가요?",
      "처음부터 갚을 능력이나 의사가 없었다고 볼 사정이 있나요?",
    ],
  },
];

async function init() {
  try {
    const response = await fetch("/data/case-types.json");
    caseTypes = response.ok ? await response.json() : fallbackCaseTypes;
  } catch {
    caseTypes = fallbackCaseTypes;
  }

  renderCaseTypes();
  renderQuestions();
  renderDraft(localDraft(), {
    missingInfo: ["사건 설명을 입력하면 누락 항목을 확인합니다."],
    precedentQueries: buildPrecedentQueries(getSelectedType()),
  });

  controls.generate.addEventListener("click", generateAiDraft);
  controls.template.addEventListener("click", () => {
    renderDraft(localDraft(), localMeta());
    statusText.textContent = "템플릿 초안을 생성했습니다.";
  });
  controls.copy.addEventListener("click", copyDraft);
  controls.clear.addEventListener("click", clearForm);
  controls.txt.addEventListener("click", downloadTxt);
  controls.print.addEventListener("click", () => window.print());
  form.addEventListener("input", renderLiveChecks);
}

function renderCaseTypes() {
  grid.innerHTML = "";
  for (const item of caseTypes) {
    const button = document.createElement("button");
    button.className = "case-card";
    button.type = "button";
    button.setAttribute("aria-pressed", String(item.id === selectedCaseType));
    button.innerHTML = `<strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.summary)}</p>`;
    button.addEventListener("click", () => {
      selectedCaseType = item.id;
      renderCaseTypes();
      renderQuestions();
      renderLiveChecks();
    });
    grid.append(button);
  }
}

function renderQuestions() {
  questions.innerHTML = "";
  for (const text of getSelectedType().questions || []) {
    const item = document.createElement("div");
    item.className = "question-item";
    item.textContent = text;
    questions.append(item);
  }
}

async function generateAiDraft() {
  const payload = getPayload();
  if (!payload.story.trim()) {
    statusText.textContent = "사건 설명을 먼저 입력하세요.";
    form.elements.story.focus();
    return;
  }

  setLoading(true);
  statusText.textContent = "AI가 사실관계와 고소장 구조를 정리하는 중입니다.";

  try {
    const response = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "AI 초안 생성에 실패했습니다.");
    renderDraft(result.draftText, result);
    statusText.textContent = result.usedAi
      ? "AI 초안을 생성했습니다. 제출 전 반드시 사실관계를 직접 확인하세요."
      : "API 키가 없어 템플릿 초안을 생성했습니다.";
  } catch (error) {
    renderDraft(localDraft(), localMeta());
    statusText.textContent = `${error.message} 템플릿 초안으로 대체했습니다.`;
  } finally {
    setLoading(false);
  }
}

function getPayload() {
  const data = Object.fromEntries(new FormData(form).entries());
  const type = getSelectedType();
  return {
    ...data,
    caseTypeId: type.id,
    caseTypeName: type.name,
    lawKeywords: type.lawKeywords || [],
    questions: type.questions || [],
  };
}

function getSelectedType() {
  return caseTypes.find((item) => item.id === selectedCaseType) || caseTypes[0] || fallbackCaseTypes[0];
}

function localDraft() {
  const data = getPayload();
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [
    "고 소 장",
    "",
    "1. 고소인",
    data.complainant || "[고소인 성명, 주소, 연락처 기재]",
    "",
    "2. 피고소인",
    data.accused || "[피고소인 성명, 주소, 연락처 또는 성명불상 기재]",
    "",
    "3. 고소취지",
    `고소인은 피고소인을 ${data.caseTypeName || "관련 범죄"} 혐의로 고소하오니, 철저히 수사하여 법에 따라 처벌하여 주시기 바랍니다.`,
    "",
    "4. 범죄사실",
    `가. 사건 일시: ${data.incidentDate || "[일시 기재]"}`,
    `나. 사건 장소: ${data.incidentPlace || "[장소 기재]"}`,
    `다. 피해 내용: ${data.damage || "[피해금액 또는 피해내용 기재]"}`,
    "",
    data.story || "[사건 경위를 시간순으로 구체적으로 기재합니다.]",
    "",
    "5. 고소이유",
    `위 사실관계는 ${data.caseTypeName || "형사사건"} 쟁점과 관련될 수 있으므로, 고소인은 수사기관의 판단을 구하고자 본 고소장을 제출합니다.`,
    "",
    "6. 증거자료",
    data.evidence || "[문자, 카카오톡, 계좌이체내역, 사진, 진단서, 녹취, CCTV 등]",
    "",
    "7. 첨부서류",
    "가. 증거자료 사본 각 1부",
    "나. 신분증 사본 1부",
    "다. 기타 피해 사실을 확인할 수 있는 자료",
    "",
    "8. 유의사항",
    "본 문서는 사용자가 입력한 사실관계를 바탕으로 작성한 초안이며 법률 자문이 아닙니다. 제출 전 변호사 또는 수사기관 상담을 권장합니다.",
    "",
    today,
    "",
    "고소인: ____________________ (서명 또는 인)",
  ].join("\n");
}

function localMeta() {
  return {
    missingInfo: findMissingInfo(getPayload()),
    precedentQueries: buildPrecedentQueries(getSelectedType()),
  };
}

function findMissingInfo(data) {
  const labels = [
    ["complainant", "고소인 인적사항"],
    ["accused", "피고소인 인적사항 또는 성명불상 사유"],
    ["incidentDate", "사건 일시"],
    ["incidentPlace", "사건 장소"],
    ["damage", "피해금액 또는 피해내용"],
    ["evidence", "증거자료"],
    ["story", "시간순 사건 설명"],
  ];
  const missing = labels.filter(([key]) => !String(data[key] || "").trim()).map(([, label]) => label);
  return missing.length ? missing : ["현재 입력 기준으로 핵심 항목은 채워져 있습니다."];
}

function buildPrecedentQueries(type) {
  return (type.lawKeywords || [type.name]).map((keyword) => {
    const label = `${type.name} ${keyword}`;
    return {
      label,
      url: `https://www.law.go.kr/precSc.do?query=${encodeURIComponent(label)}`,
    };
  });
}

function renderDraft(text, meta = {}) {
  editor.value = text || "";
  renderList(missingList, meta.missingInfo || []);
  renderPrecedents(meta.precedentQueries || buildPrecedentQueries(getSelectedType()));
}

function renderLiveChecks() {
  renderList(missingList, findMissingInfo(getPayload()));
  renderPrecedents(buildPrecedentQueries(getSelectedType()));
}

function renderList(target, items) {
  target.innerHTML = "";
  for (const text of items.length ? items : ["추가 확인 항목이 없습니다."]) {
    const li = document.createElement("li");
    li.textContent = typeof text === "string" ? text : text.label;
    target.append(li);
  }
}

function renderPrecedents(items) {
  precedentList.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.url || "https://www.law.go.kr/precSc.do";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = item.label || item;
    li.append(link);
    precedentList.append(li);
  }
}

async function copyDraft() {
  if (!editor.value.trim()) return;
  await navigator.clipboard.writeText(editor.value);
  statusText.textContent = "초안을 클립보드에 복사했습니다.";
}

function clearForm() {
  form.reset();
  selectedCaseType = "fraud";
  renderCaseTypes();
  renderQuestions();
  renderDraft(localDraft(), localMeta());
  statusText.textContent = "입력값을 초기화했습니다.";
}

function downloadTxt() {
  const blob = new Blob([editor.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "고소장-초안.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

function setLoading(isLoading) {
  controls.generate.disabled = isLoading;
  controls.template.disabled = isLoading;
  controls.generate.textContent = isLoading ? "생성 중" : "AI 초안 생성";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
