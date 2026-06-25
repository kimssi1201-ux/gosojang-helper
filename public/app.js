const $ = (selector) => document.querySelector(selector);

const form = $("#complaintForm");
const grid = $("#caseTypeGrid");
const questions = $("#dynamicQuestions");
const editor = $("#draftEditor");
const statusText = $("#statusText");
const autoSaveStatus = $("#autoSaveStatus");
const missingList = $("#missingList");
const precedentList = $("#precedentList");

const controls = {
  generate: $("#generateBtn"),
  template: $("#templateBtn"),
  save: $("#saveDraftBtn"),
  load: $("#loadDraftBtn"),
  kakaoShare: $("#kakaoShareBtn"),
  menuSave: $("#menuSaveBtn"),
  menuShare: $("#menuShareBtn"),
  txt: $("#downloadTxtBtn"),
  print: $("#printBtn"),
};

let caseTypes = [];
let selectedCaseType = "fraud";
let kakaoSdkReady = false;
const draftStorageKey = "gosojang-helper:draft";
const autoSaveStorageKey = "gosojang-helper:auto";

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

  const restored = restoreAutoSavedState();
  renderCaseTypes();
  renderQuestions(restored?.checkedQuestions || []);
  renderDraft(restored?.draftText || localDraft(), restored ? localMeta() : {
    missingInfo: ["기본정보를 입력하면 고소장 양식에 바로 반영됩니다."],
    precedentQueries: buildPrecedentQueries(getSelectedType()),
  });
  statusText.textContent = "기본정보를 입력하면 고소장이 자동으로 채워집니다.";

  controls.generate?.addEventListener("click", generateDraft);
  controls.template?.addEventListener("click", syncDraftFromInputs);
  controls.save?.addEventListener("click", saveDraft);
  controls.load?.addEventListener("click", loadDraft);
  controls.kakaoShare?.addEventListener("click", shareToKakao);
  controls.menuSave?.addEventListener("click", saveDraft);
  controls.menuShare?.addEventListener("click", shareToKakao);
  controls.txt?.addEventListener("click", downloadTxt);
  controls.print?.addEventListener("click", () => window.print());
  form.addEventListener("input", () => {
    syncDraftFromInputs();
    autoSave();
  });
  form.addEventListener("change", () => {
    syncDraftFromInputs();
    autoSave();
  });
  questions.addEventListener("change", () => {
    syncDraftFromInputs();
    autoSave();
  });
  editor.addEventListener("input", autoSave);
}

function syncDraftFromInputs() {
  renderDraft(localDraft(), localMeta());
  statusText.textContent = "입력한 내용이 고소장 양식에 반영됐습니다.";
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
      syncDraftFromInputs();
      autoSave();
    });
    grid.append(button);
  }
}

function renderQuestions(checkedQuestions = []) {
  questions.innerHTML = "";
  for (const text of getSelectedType().questions || []) {
    const item = document.createElement("label");
    item.className = "question-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = text;
    checkbox.checked = checkedQuestions.includes(text);
    const span = document.createElement("span");
    span.textContent = text;
    item.append(checkbox, span);
    questions.append(item);
  }
}

async function generateDraft() {
  const payload = getPayload();
  if (!payload.story.trim()) {
    statusText.textContent = "사건 설명을 먼저 입력하세요.";
    form.elements.story.focus();
    return;
  }

  setLoading(true);
  statusText.textContent = "검찰청 표준서식 흐름에 맞춰 정리하는 중입니다.";

  try {
    const response = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "초안 생성에 실패했습니다.");
    renderDraft(result.draftText, result);
    autoSave();
    statusText.textContent = result.usedAi
      ? "고소장 초안을 제출용 흐름으로 생성했습니다. 제출 전 사실관계를 확인하세요."
      : "기본 고소장 양식으로 생성했습니다.";
  } catch (error) {
    renderDraft(localDraft(), localMeta());
    statusText.textContent = `${error.message} 기본 양식으로 대체했습니다.`;
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
    checkedQuestions: getCheckedQuestions(),
  };
}

function getSelectedType() {
  return caseTypes.find((item) => item.id === selectedCaseType) || caseTypes[0] || fallbackCaseTypes[0];
}

function localDraft() {
  return buildComplaintDraft(getPayload());
}

function buildComplaintDraft(data, ai = {}) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const evidenceItems = splitEvidence(data.evidence);

  return [
    "고 소 장",
    "",
    "1. 고소인*",
    `성명: ${data.complainant || "[고소인 성명]"}`,
    "주민등록번호: [제출 전 직접 기재]",
    `주소: ${data.complainantAddress || "[주소]"}`,
    "직업: [직업]",
    `전화: ${data.complainantPhone || "[연락처]"}`,
    "이메일: [이메일]",
    "대리인에 의한 고소: □ 해당 없음  □ 법정대리인  □ 고소대리인",
    "",
    "2. 피고소인*",
    `성명: ${data.accused || "[피고소인 성명 또는 성명불상]"}`,
    "주민등록번호: [알고 있는 경우 제출 전 직접 기재]",
    `주소: ${data.accusedAddress || "[주소 또는 알 수 없는 사유]"}`,
    "직업: [직업]",
    `전화: ${data.accusedContact || "[연락처 또는 계정]"}`,
    "이메일: [이메일]",
    "기타사항: [고소인과의 관계, 인상착의, 계정명 등]",
    "",
    "3. 고소취지*",
    ai.purpose || `고소인은 피고소인을 ${data.caseTypeName || "관련 범죄"} 혐의로 고소하오니, 철저히 수사하여 법에 따라 처벌하여 주시기 바랍니다.`,
    "",
    "4. 범죄사실*",
    ai.facts || buildFactSection(data),
    "",
    "5. 고소이유",
    ai.reason || buildReasonSection(data),
    "",
    "6. 증거자료",
    evidenceItems.length
      ? "☑ 고소인은 고소인의 진술 외에 제출할 증거가 있습니다."
      : "□ 고소인은 고소인의 진술 외에 제출할 증거가 없습니다.",
    ai.evidence || `증거자료: ${evidenceItems.length ? evidenceItems.join(", ") : "[문자, 카카오톡, 계좌이체내역, 사진, 진단서, 녹취, CCTV 등]"}`,
    "",
    "7. 관련사건의 수사 및 재판 여부*",
    "① 중복 고소 여부: □ 있습니다 / ☑ 없습니다",
    "② 관련 형사사건 수사 유무: □ 수사 중에 있습니다 / ☑ 수사 중에 있지 않습니다",
    "③ 관련 민사소송 유무: □ 민사소송 중에 있습니다 / ☑ 민사소송 중에 있지 않습니다",
    "기타사항: [관련 사건이 있으면 검찰청, 경찰서, 법원, 사건번호 등을 기재]",
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
    ai.cautions || "제출 전 사실관계, 증거자료, 날짜와 서명을 다시 확인합니다.",
  ].join("\n");
}

function buildFactSection(data) {
  const accusedName = data.accused || "[피고소인 성명 또는 성명불상]";
  const accusedDetails = [data.accusedContact && `연락처/계정: ${data.accusedContact}`, data.accusedAddress && `주소/단서: ${data.accusedAddress}`].filter(Boolean);
  const accusedLine = accusedDetails.length
    ? `피고소인은 ${accusedName}(${accusedDetails.join(", ")})입니다.`
    : `피고소인은 ${accusedName}입니다.`;
  const unknownLine = /성명불상|미상|모름|불상/u.test(accusedName)
    ? "현재 피고소인의 정확한 인적사항을 알 수 없으나, 위 연락처·계정·주소 단서와 피해 경위로 피고소인을 특정할 수 있습니다."
    : "";
  const checkedLine = data.checkedQuestions?.length ? data.checkedQuestions.join(", ") : "[해당되는 추가 질문을 체크하면 자동 반영]";

  return [
    "가. 피고소인 특정",
    accusedLine,
    unknownLine,
    "",
    "나. 범행 일시와 장소",
    `피고소인은 ${data.incidentDate || "[일시 기재]"}, ${data.incidentPlace || "[장소 기재]"}에서 아래 행위를 하였습니다.`,
    "",
    "다. 범행 방법과 구체적 행위",
    data.story || "[피고소인이 한 말, 행동, 돈이나 물건을 받은 방법, 폭행·협박·게시글 등 구체적 행위를 시간순으로 기재]",
    "",
    "라. 피해 결과",
    `그 결과 고소인은 ${data.damage || "[피해금액 또는 피해내용 기재]"}의 피해를 입었습니다.`,
    "",
    "마. 범죄유형 및 보충 사정",
    `위 행위는 ${data.caseTypeName || "[범죄유형]"} 혐의와 관련된 사실로 정리됩니다.`,
    `추가 확인 항목: ${checkedLine}`,
  ].filter((line) => line !== "").join("\n");
}

function buildReasonSection(data) {
  return [
    `위 범죄사실은 ${data.caseTypeName || "형사사건"} 혐의와 관련될 수 있습니다.`,
    data.damage ? `고소인은 이 사건으로 ${data.damage}의 피해를 입었습니다.` : "고소인은 이 사건으로 피해를 입었습니다.",
    data.story ? "고소인은 위 범죄사실을 사실 중심으로 정리하여 제출하며, 수사기관의 사실관계 확인을 요청합니다." : "고소인은 사건 경위를 추가로 보완하여 제출할 예정입니다.",
    "따라서 피고소인에 대한 사실관계를 확인하고 법에 따라 처리해 주시기 바랍니다.",
  ].join("\n");
}

function buildAttachmentList(evidenceItems) {
  const rows = evidenceItems.length
    ? evidenceItems.map((item, index) => `${index + 1}) ${item} / 작성자 또는 보관자: [직접 기재] / 제출 유무: ☑ 접수시 제출 □ 수사 중 제출`)
    : ["1) [증거명] / 작성자 또는 보관자: [직접 기재] / 제출 유무: □ 접수시 제출 □ 수사 중 제출"];

  return [
    "[별지] 증거자료 세부 목록",
    "",
    "1. 인적증거 (목격자, 참고인 등)",
    "성명: [참고인 성명] / 연락처: [연락처] / 입증하려는 내용: [무엇을 증명하는지]",
    "",
    "2. 증거서류·사진·자료",
    ...rows,
    "",
    "3. 증거물",
    "1) [증거물] / 소유자: [소유자] / 제출 유무: □ 접수시 제출 □ 수사 중 제출",
    "",
    "4. 기타 증거",
    evidenceItems.length ? "위 목록 외 추가 증거가 있으면 직접 기재합니다." : "[그 밖의 증거가 있으면 기재]",
  ].join("\n");
}

function splitEvidence(value) {
  return String(value || "")
    .split(/[,，、\/\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function localMeta() {
  return {
    missingInfo: findMissingInfo(getPayload()),
    precedentQueries: buildPrecedentQueries(getSelectedType()),
  };
}

function findMissingInfo(data) {
  const labels = [
    ["complainant", "고소인 성명"],
    ["complainantPhone", "고소인 연락처"],
    ["accused", "피고소인 성명 또는 성명불상 사유"],
    ["incidentDate", "사건 일시"],
    ["incidentPlace", "사건 장소"],
    ["damage", "피해금액 또는 피해내용"],
    ["evidence", "증거자료"],
    ["story", "범죄사실 설명"],
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

function getCheckedQuestions() {
  return [...questions.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function saveDraft() {
  const saved = {
    savedAt: new Date().toISOString(),
    selectedCaseType,
    formData: getPayload(),
    checkedQuestions: getCheckedQuestions(),
    draftText: editor.value,
  };
  localStorage.setItem(draftStorageKey, JSON.stringify(saved));
  statusText.textContent = "현재 입력 내용과 초안을 이 브라우저에 저장했습니다.";
}

function loadDraft() {
  const raw = localStorage.getItem(draftStorageKey);
  if (!raw) {
    statusText.textContent = "저장된 초안이 없습니다.";
    return;
  }

  try {
    const saved = JSON.parse(raw);
    selectedCaseType = saved.selectedCaseType || "fraud";
    renderCaseTypes();
    renderQuestions(saved.checkedQuestions || saved.formData?.checkedQuestions || []);
    setFormValues(saved.formData || {});
    renderDraft(saved.draftText || localDraft(), localMeta());
    const savedAt = saved.savedAt ? new Date(saved.savedAt).toLocaleString("ko-KR") : "저장된";
    statusText.textContent = `${savedAt} 초안을 불러왔습니다.`;
  } catch {
    statusText.textContent = "저장된 초안을 읽지 못했습니다.";
  }
}

function autoSave() {
  const saved = {
    savedAt: new Date().toISOString(),
    selectedCaseType,
    formData: getPayload(),
    checkedQuestions: getCheckedQuestions(),
    draftText: editor.value,
  };
  localStorage.setItem(autoSaveStorageKey, JSON.stringify(saved));
  if (autoSaveStatus) autoSaveStatus.textContent = "자동 저장됨";
}

function restoreAutoSavedState() {
  const raw = localStorage.getItem(autoSaveStorageKey);
  if (!raw) return null;

  try {
    const saved = JSON.parse(raw);
    selectedCaseType = saved.selectedCaseType || selectedCaseType;
    setFormValues(saved.formData || {});
    if (autoSaveStatus) autoSaveStatus.textContent = "이전에 작성하던 내용을 불러왔습니다.";
    return saved;
  } catch {
    return null;
  }
}

function setFormValues(data) {
  for (const element of form.elements) {
    if (!element.name || data[element.name] === undefined) continue;
    element.value = data[element.name];
  }
}

async function shareToKakao() {
  const shareData = {
    title: "고소장 도우미",
    text: "형사 고소장 초안 작성을 도와주는 사이트입니다.",
    url: window.location.origin,
  };

  try {
    const kakaoReady = await ensureKakaoSdk();
    if (kakaoReady && window.Kakao?.Share?.sendDefault) {
      window.Kakao.Share.sendDefault({
        objectType: "text",
        text: `${shareData.title}\n${shareData.text}`,
        link: { mobileWebUrl: shareData.url, webUrl: shareData.url },
        buttons: [{ title: "열어보기", link: { mobileWebUrl: shareData.url, webUrl: shareData.url } }],
      });
      statusText.textContent = "카카오톡 공유창을 열었습니다.";
      return;
    }

    await fallbackShare(shareData);
  } catch {
    await fallbackShare(shareData);
  }
}

async function ensureKakaoSdk() {
  if (kakaoSdkReady) return true;

  const response = await fetch("/api/config");
  const config = response.ok ? await response.json() : {};
  if (!config.kakaoJavascriptKey) return false;

  await loadScript("https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js");
  if (!window.Kakao?.isInitialized?.()) window.Kakao.init(config.kakaoJavascriptKey);

  kakaoSdkReady = true;
  return true;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

async function fallbackShare(shareData) {
  if (navigator.share) {
    await navigator.share(shareData);
    statusText.textContent = "공유창을 열었습니다.";
    return;
  }

  await navigator.clipboard.writeText(shareData.url);
  statusText.textContent = "카카오 키가 없어 사이트 링크를 복사했습니다.";
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
  if (controls.template) controls.template.disabled = isLoading;
  controls.generate.textContent = isLoading ? "생성 중" : "초안 생성";
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
