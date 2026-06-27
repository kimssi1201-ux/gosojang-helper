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
  copy: $("#copyDraftBtn"),
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
const stableDraftApiUrl = "https://gosojang-helper.pages.dev/api/draft";
const factSectionTitles = [
  "가. 피고소인 특정",
  "나. 고소인과 피고소인의 관계 및 사건 경위",
  "다. 범행 일시와 장소",
  "라. 범행 방법과 구체적 행위",
  "마. 피해 결과",
  "바. 증거와 연결되는 사실",
  "사. 범죄유형 및 보충 사정",
];

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
  renderQuestions(restored?.questionAnswers || restored?.checkedQuestions || []);
  renderDraft(restored?.draftText || localDraft(), restored ? localMeta() : {
    missingInfo: ["기본정보를 입력하면 고소장 양식에 바로 반영됩니다."],
    precedentQueries: buildPrecedentQueries(getSelectedType()),
  });
  statusText.textContent = "기본정보를 입력하면 고소장이 자동으로 채워집니다.";

  controls.generate?.addEventListener("click", generateDraft);
  controls.template?.addEventListener("click", syncDraftFromInputs);
  controls.save?.addEventListener("click", saveDraft);
  controls.load?.addEventListener("click", loadDraft);
  controls.copy?.addEventListener("click", copyDraft);
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
  questions.addEventListener("input", () => {
    syncDraftFromInputs();
    autoSave();
  });
  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("textarea")) autoResizeTextareas(event.target);
  });
  editor.addEventListener("input", autoSave);
  autoResizeTextareas();
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
    const selectedHint = item.id === selectedCaseType ? '<span class="case-hint">선택됨. 다음을 누르세요.</span>' : "";
    button.innerHTML = `<strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.summary)}</p>${selectedHint}`;
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

function renderQuestions(savedAnswers = []) {
  const saved = Array.isArray(savedAnswers) ? savedAnswers : [];
  questions.innerHTML = "";
  for (const [index, text] of (getSelectedType().questions || []).entries()) {
    const savedItem = saved.find((item) => item?.question === text || item?.index === index || item === text);
    const item = document.createElement("label");
    item.className = "question-item question-answer-item";
    const span = document.createElement("span");
    span.textContent = text;
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.dataset.questionIndex = String(index);
    textarea.dataset.question = text;
    textarea.placeholder = "여기에 답변을 적어주세요. 모르면 비워도 됩니다.";
    textarea.value = typeof savedItem === "string" ? "" : savedItem?.answer || "";
    item.append(span, textarea);
    questions.append(item);
  }
  autoResizeTextareas();
}

function getDraftApiUrl() {
  return ["seeyou.kr", "www.seeyou.kr"].includes(window.location.hostname) ? stableDraftApiUrl : "/api/draft";
}

async function generateDraft() {
  const payload = getPayload();
  if (!payload.story.trim()) {
    statusText.textContent = "피해사실을 먼저 입력하세요.";
    form.elements.story.focus();
    return;
  }

  setLoading(true);
  statusText.textContent = "검찰청 표준서식 흐름에 맞춰 정리하는 중입니다.";

  try {
    const draftApiUrl = getDraftApiUrl();
    const response = await fetch(draftApiUrl, {
      method: "POST",
      headers: { "Content-Type": draftApiUrl.startsWith("http") ? "text/plain;charset=utf-8" : "application/json" },
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
  const facts = ensureCheckedFactsInFacts(normalizeFactSection(ai.facts) || buildFactSection(data, evidenceItems), data);

  return [
    "고 소 장",
    "",
    "1. 고소인*",
    `성명: ${valueOr(data.complainant, "[고소인 성명]")}`,
    "주민등록번호: [제출 전 직접 기재]",
    `주소: ${valueOr(data.complainantAddress, "[주소]")}`,
    "직업: [직업]",
    `전화: ${valueOr(data.complainantPhone, "[연락처]")}`,
    "이메일: [이메일]",
    "대리인에 의한 고소: ☑ 해당 없음  □ 법정대리인  □ 고소대리인",
    "",
    "2. 피고소인*",
    `성명: ${valueOr(data.accused, "[피고소인 성명 또는 성명불상]")}`,
    "주민등록번호: [알고 있는 경우 제출 전 직접 기재]",
    `주소: ${valueOr(data.accusedAddress, "[주소 또는 알 수 없는 사유]")}`,
    "직업: [직업]",
    `전화: ${valueOr(data.accusedContact, "[연락처 또는 계정]")}`,
    "이메일: [이메일]",
    "기타사항: [고소인과의 관계, 인상착의, 계정명, 계좌번호 등 특정 단서]",
    "",
    "3. 고소취지*",
    ai.purpose || buildPurpose(data),
    "",
    "4. 범죄사실*",
    facts,
    "",
    "5. 고소이유",
    ai.reason || buildReasonSection(data, evidenceItems),
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
    ai.cautions || buildCautions(data, evidenceItems),
  ].join("\n");
}

function normalizeFactSection(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return factSectionTitles.every((title) => text.includes(title)) ? text : "";
}

function buildPurpose(data) {
  const accused = valueOr(data.accused, "피고소인");
  const caseType = valueOr(data.caseTypeName, "관련 범죄");
  return `고소인은 피고소인 ${accused}을(를) ${caseType} 혐의로 고소하오니, 아래 범죄사실과 증거자료를 토대로 철저히 수사하여 법에 따라 처벌하여 주시기 바랍니다.`;
}

function buildFactSection(data, evidenceItems) {
  const accusedName = valueOr(data.accused, "[피고소인 성명 또는 성명불상]");
  const accusedDetails = [
    data.accusedContact && `연락처/계정: ${data.accusedContact}`,
    data.accusedAddress && `주소/단서: ${data.accusedAddress}`,
  ].filter(Boolean);
  const accusedLine = accusedDetails.length
    ? `피고소인은 ${accusedName}(${accusedDetails.join(", ")})입니다.`
    : `피고소인은 ${accusedName}입니다.`;
  const unknownLine = /성명불상|미상|모름|불상/u.test(accusedName)
    ? "현재 피고소인의 정확한 인적사항 전부를 알 수는 없으나, 위 연락처·계정·주소 단서, 대화내역, 송금내역 등으로 피고소인을 특정할 수 있을 것으로 보입니다."
    : "";
  const checkedLine = data.checkedQuestions?.length
    ? data.checkedQuestions.join(" / ")
    : "[추가로 확인된 보강 사실이 있으면 위 체크 항목에 반영됩니다]";
  const requirements = getCaseTypeRequirements(data).join(" / ");
  const checkedFactText = buildCheckedFactText(data);
  const typeFacts = buildTypeSpecificFactText(data, evidenceItems);

  return [
    "가. 피고소인 특정",
    accusedLine,
    unknownLine,
    "",
    "나. 고소인과 피고소인의 관계 및 사건 경위",
    typeFacts.background,
    "",
    "다. 범행 일시와 장소",
    typeFacts.timePlace,
    "",
    "라. 범행 방법과 구체적 행위",
    typeFacts.action,
    checkedFactText,
    "",
    "마. 피해 결과",
    typeFacts.damage,
    "",
    "바. 증거와 연결되는 사실",
    typeFacts.evidence,
    "",
    "사. 범죄유형 및 보충 사정",
    `${typeFacts.legalPoint} 이 유형에서 특히 확인할 내용은 ${requirements}입니다. 현재 고소인이 확인한 보강 사실은 ${checkedLine}입니다.`,
  ].filter((line) => line !== "").join("\n");
}

function buildTypeSpecificFactText(data, evidenceItems) {
  const date = valueOr(data.incidentDate, "[사건 일시]");
  const place = valueOr(data.incidentPlace, "[사건 장소]");
  const damage = valueOr(data.damage, "[피해금액 또는 피해내용]");
  const story = valueOr(data.story, "[피고소인의 말과 행동을 시간순으로 기재]");
  const evidence = evidenceItems.length ? evidenceItems.join(", ") : "[증거자료]";
  const commonEvidence = evidenceItems.length
    ? `고소인은 ${evidence} 자료를 제출할 예정입니다. 위 자료는 범행 경위, 피고소인의 행위, 피해 발생 시점과 피해 결과를 확인하기 위한 자료입니다.`
    : "현재 제출할 증거자료가 구체적으로 정리되지 않았습니다. 대화내역, 사진, 녹취, CCTV, 계좌내역 등 사건을 뒷받침할 자료를 제출 전 정리합니다.";

  const templates = {
    fraud: {
      background: `고소인은 피고소인의 말, 자료, 약속 또는 거래 제안을 믿고 금전이나 재산을 처분하게 되었습니다. 처음 연락하게 된 경위, 피고소인이 제시한 조건, 고소인이 이를 믿게 된 이유를 중심으로 사건 경위를 정리합니다.`,
      timePlace: `피고소인은 ${date}, ${place}에서 또는 그 무렵 전화, 문자, 카카오톡, 계좌거래, 계약서 작성 등의 방법으로 고소인에게 금전이나 재산 이전을 요구하였습니다.`,
      action: `${story}\n사기 사건에서는 피고소인이 어떤 거짓말이나 자료로 고소인을 믿게 했는지, 고소인이 그 말을 믿고 언제 얼마를 어떤 방법으로 넘겼는지, 피고소인이 처음부터 변제하거나 이행할 의사 또는 능력이 없었다고 볼 사정을 구체적으로 적어야 합니다.`,
      damage: `그 결과 고소인은 ${damage}의 재산상 피해를 입었습니다. 송금일, 금액, 계좌, 물품 또는 권리 이전 내용, 반환 요구와 미변제 경과를 함께 보완합니다.`,
      evidence: evidenceItems.length
        ? `고소인은 ${evidence} 자료로 피고소인의 설명 내용, 송금 또는 재산 이전 내역, 변제 약속, 연락 회피 또는 미이행 경과를 입증할 예정입니다.`
        : "사기 사건에서는 대화내역, 계약서, 계좌이체내역, 영수증, 차용증, 피고소인의 변제 약속 자료를 우선 정리합니다.",
      legalPoint: "이 사건은 사기 혐의와 관련되며, 핵심은 기망행위, 고소인의 착오, 재산 처분, 피해 발생, 처음부터 이행 의사나 능력이 없었다고 볼 사정입니다.",
    },
    assault: {
      background: `고소인은 피고소인과의 말다툼, 접촉, 충돌 또는 기존 관계에서 신체 피해를 입었습니다. 사건 전후의 다툼 경위와 현장 상황을 중심으로 정리합니다.`,
      timePlace: `피고소인은 ${date}, ${place}에서 고소인의 신체에 유형력을 행사하였거나 상해를 입게 하였습니다.`,
      action: `${story}\n폭행/상해 사건에서는 맞은 부위, 폭행 방법, 횟수, 사용한 물건, 넘어진 경위, 주변 사람이 본 장면을 구체적으로 적어야 합니다.`,
      damage: `그 결과 고소인은 ${damage}의 피해를 입었습니다. 통증 부위, 상처 사진, 병원 진료일, 진단명, 치료기간, 일상생활 지장을 함께 보완합니다.`,
      evidence: evidenceItems.length
        ? `고소인은 ${evidence} 자료로 폭행 장면, 상처 상태, 치료 내역, 신고 경위 또는 목격자 진술을 입증할 예정입니다.`
        : "폭행/상해 사건에서는 상처 사진, 진단서, 진료확인서, CCTV, 목격자 연락처, 신고내역을 우선 정리합니다.",
      legalPoint: "이 사건은 폭행 또는 상해 혐의와 관련되며, 핵심은 신체에 대한 유형력 행사, 상해 발생 여부, 폭행 방법, 피해 부위와 치료 내역입니다.",
    },
    threat: {
      background: `고소인은 피고소인의 말, 메시지, 전화, 방문 또는 요구로 인해 공포심이나 압박을 느꼈습니다. 피고소인이 무엇을 요구했는지와 고소인이 왜 두려움을 느꼈는지를 중심으로 정리합니다.`,
      timePlace: `피고소인은 ${date}, ${place}에서 또는 그 무렵 대화, 문자, 전화, 온라인 메시지 등의 방법으로 고소인에게 해악을 고지하거나 금전 또는 행동을 요구하였습니다.`,
      action: `${story}\n협박/공갈 사건에서는 피고소인이 한 말의 원문, 요구한 내용, 고소인이 느낀 공포심, 돈이나 행동을 하게 된 경위를 구체적으로 적어야 합니다.`,
      damage: `그 결과 고소인은 ${damage}의 피해를 입었습니다. 금전 지급, 정신적 불안, 생활상 제한, 추가 연락 회피 등 실제 피해를 보완합니다.`,
      evidence: evidenceItems.length
        ? `고소인은 ${evidence} 자료로 협박성 표현의 원문, 요구 내용, 지급 또는 행동 경위, 반복 연락 사실을 입증할 예정입니다.`
        : "협박/공갈 사건에서는 문자, 카카오톡, 녹취, 통화기록, 송금내역, 목격자 진술을 우선 정리합니다.",
      legalPoint: "이 사건은 협박 또는 공갈 혐의와 관련되며, 핵심은 해악 고지, 공포심 유발, 금전 또는 행동 요구, 그로 인한 처분행위입니다.",
    },
    defamation: {
      background: `고소인은 피고소인의 게시글, 댓글, 발언, 단체방 메시지 또는 온라인 게시물로 인해 명예나 사회적 평가가 훼손되었습니다. 표현이 공개된 경위와 누가 볼 수 있었는지를 중심으로 정리합니다.`,
      timePlace: `피고소인은 ${date}, ${place} 또는 온라인 공간에서 고소인을 지칭하거나 고소인으로 볼 수 있는 표현을 게시 또는 발언하였습니다.`,
      action: `${story}\n명예훼손/모욕 사건에서는 문제 표현의 원문, 게시 위치, 공개 범위, 고소인을 가리킨다는 사정, 허위 여부 또는 모욕적 표현을 구체적으로 적어야 합니다.`,
      damage: `그 결과 고소인은 ${damage}의 피해를 입었습니다. 주변 사람들의 인식 변화, 항의 연락, 업무나 인간관계 피해, 정신적 고통을 함께 보완합니다.`,
      evidence: evidenceItems.length
        ? `고소인은 ${evidence} 자료로 게시글 또는 발언 원문, 게시 위치, 작성자 계정, 공개 범위, 고소인 특정 가능성을 입증할 예정입니다.`
        : "명예훼손/모욕 사건에서는 캡처, URL, 작성자 계정, 게시 일시, 댓글 반응, 단체방 참여자 자료를 우선 정리합니다.",
      legalPoint: "이 사건은 명예훼손 또는 모욕 혐의와 관련되며, 핵심은 공연성, 피해자 특정성, 사실 적시 또는 모욕 표현, 피해 발생입니다.",
    },
    embezzlement: {
      background: `고소인은 피고소인에게 돈, 물건, 회사 자산 또는 업무상 관리 권한을 맡겼으나, 피고소인이 이를 정해진 용도와 다르게 사용하거나 반환하지 않았습니다.`,
      timePlace: `피고소인은 ${date}, ${place}에서 또는 그 무렵 보관 또는 관리하던 재산을 임의로 사용하거나 반환하지 않았습니다.`,
      action: `${story}\n횡령/배임 사건에서는 피고소인이 어떤 지위에서 무엇을 보관하거나 관리했는지, 정해진 용도와 실제 사용처가 어떻게 다른지, 회사나 고소인에게 어떤 손해가 생겼는지를 구체적으로 적어야 합니다.`,
      damage: `그 결과 고소인은 ${damage}의 손해를 입었습니다. 손해액 산정 근거, 회계자료, 반환 요구, 피고소인의 설명 또는 거부 경위를 함께 보완합니다.`,
      evidence: evidenceItems.length
        ? `고소인은 ${evidence} 자료로 피고소인의 보관자 지위, 자금 또는 자산 이동, 용도 외 사용, 손해액을 입증할 예정입니다.`
        : "횡령/배임 사건에서는 계좌내역, 장부, 계약서, 업무지시 자료, 회사 규정, 반환 요구 내역을 우선 정리합니다.",
      legalPoint: "이 사건은 횡령 또는 배임 혐의와 관련되며, 핵심은 보관자 또는 업무상 지위, 임무 위배, 용도 외 사용, 재산상 손해입니다.",
    },
    stalking: {
      background: `고소인은 피고소인의 반복적인 연락, 접근, 기다림, 감시 또는 가족 간 폭력으로 불안감과 생활상 피해를 겪었습니다. 반복된 기간과 거부 의사 표시를 중심으로 정리합니다.`,
      timePlace: `피고소인은 ${date}, ${place}에서 또는 그 무렵부터 고소인에게 반복적으로 연락하거나 접근하는 행위를 하였습니다.`,
      action: `${story}\n스토킹/가정폭력 사건에서는 연락 횟수, 접근 장소, 기다린 시간, 감시 방법, 거부 의사 표시, 가족관계 또는 동거 여부, 불안감을 느낀 이유를 구체적으로 적어야 합니다.`,
      damage: `그 결과 고소인은 ${damage}의 피해를 입었습니다. 불안감, 수면장애, 외출 제한, 직장이나 주거지 변경, 신변보호 필요성을 함께 보완합니다.`,
      evidence: evidenceItems.length
        ? `고소인은 ${evidence} 자료로 반복 연락, 접근 경로, 거부 의사 표시, 불안감과 생활 피해를 입증할 예정입니다.`
        : "스토킹/가정폭력 사건에서는 통화기록, 메시지, 위치기록, CCTV, 출입기록, 진단서, 보호요청 내역을 우선 정리합니다.",
      legalPoint: "이 사건은 스토킹 또는 가정폭력 관련 혐의와 관련되며, 핵심은 반복성, 상대방의 의사에 반한 접근 또는 연락, 불안감과 생활상 피해입니다.",
    },
    cyber: {
      background: `고소인은 온라인 사이트, 앱, 계정, 링크 또는 전자기기를 통해 피해를 입었습니다. 피해가 시작된 접속 경로와 계정 또는 URL을 중심으로 정리합니다.`,
      timePlace: `피고소인은 ${date}, ${place} 또는 온라인 공간에서 고소인의 계정, 개인정보, 금전 또는 전자자료에 피해를 발생시켰습니다.`,
      action: `${story}\n사이버범죄에서는 사용한 사이트나 앱, URL, 계정명, 피싱 링크, 접속 과정, 결제 또는 송금 과정, 계정 탈취나 게시물 유포 경위를 구체적으로 적어야 합니다.`,
      damage: `그 결과 고소인은 ${damage}의 피해를 입었습니다. 금전 피해, 계정 탈취, 개인정보 유출, 게시물 확산, 복구 비용 등을 함께 보완합니다.`,
      evidence: evidenceItems.length
        ? `고소인은 ${evidence} 자료로 접속 경로, 계정 또는 URL, 결제 또는 송금 내역, 화면 상태, 피해 발생 시점을 입증할 예정입니다.`
        : "사이버범죄에서는 화면 캡처, URL, 계정 정보, 접속기록, 결제내역, 문자 또는 이메일, 플랫폼 신고내역을 우선 정리합니다.",
      legalPoint: "이 사건은 사이버범죄와 관련되며, 핵심은 온라인 접속 경로, 계정 또는 개인정보 침해, 금전 피해, 전자자료와 화면 캡처입니다.",
    },
    business: {
      background: `고소인은 정상적으로 업무나 영업을 진행하던 중 피고소인의 허위 신고, 소란, 반복 민원, 위계 또는 위력 행사로 업무가 방해되었습니다.`,
      timePlace: `피고소인은 ${date}, ${place}에서 고소인의 업무 또는 영업이 진행되는 상황에서 방해 행위를 하였습니다.`,
      action: `${story}\n업무방해 사건에서는 원래 진행 중이던 업무, 피고소인이 사용한 위계나 위력, 반복성 또는 계획성, 업무가 실제로 중단되거나 지연된 내용을 구체적으로 적어야 합니다.`,
      damage: `그 결과 고소인은 ${damage}의 피해를 입었습니다. 매출 손실, 고객 이탈, 업무 중단 시간, 직원 대응, 민원 처리 비용을 함께 보완합니다.`,
      evidence: evidenceItems.length
        ? `고소인은 ${evidence} 자료로 방해 행위, 업무 중단, 매출 손실, 고객 이탈, 허위 신고 또는 반복 민원 경위를 입증할 예정입니다.`
        : "업무방해 사건에서는 CCTV, 녹취, 매출자료, 예약 취소 내역, 민원기록, 직원 진술, 신고내역을 우선 정리합니다.",
      legalPoint: "이 사건은 업무방해 등 혐의와 관련되며, 핵심은 정상 업무의 존재, 위계 또는 위력에 의한 방해 행위, 실제 업무 지장과 손해입니다.",
    },
  };

  return templates[data.caseTypeId] || {
    background: `고소인은 ${date} 전후로 피고소인과 이 사건과 관련된 접촉 또는 거래를 하였고, 그 과정에서 피해를 입었습니다.`,
    timePlace: `피고소인은 ${date}, ${place}에서 이 사건 행위를 하였습니다.`,
    action: story,
    damage: `그 결과 고소인은 ${damage}의 피해를 입었습니다.`,
    evidence: commonEvidence,
    legalPoint: `이 사건은 ${valueOr(data.caseTypeName, "[범죄유형]")} 혐의와 관련된 사실로 정리됩니다.`,
  };
}

function ensureCheckedFactsInFacts(facts, data) {
  const checkedFactText = buildCheckedFactText(data);
  if (!checkedFactText || facts.includes("체크한 보강 사실")) return facts;

  const marker = "\n마. 피해 결과";
  if (facts.includes(marker)) {
    return facts.replace(marker, `\n${checkedFactText}\n${marker}`);
  }

  return `${facts}\n\n${checkedFactText}`;
}

function buildCheckedFactText(data) {
  const checked = Array.isArray(data.checkedQuestions) ? data.checkedQuestions : [];
  if (!checked.length) return "";

  return [
    "체크한 보강 사실",
    ...checked.map((text) => `- ${checkedQuestionToFactSentence(data.caseTypeId, text)}`),
  ].join("\n");
}

function checkedQuestionToFactSentence(caseTypeId, text) {
  const rules = {
    fraud: [
      ["믿게 만든", "피고소인이 한 말, 자료 또는 약속 때문에 고소인이 이를 믿게 된 사정이 있어 기망행위를 뒷받침할 수 있습니다."],
      ["날짜, 금액, 방법", "고소인이 돈이나 재산을 넘긴 날짜, 금액, 방법을 설명할 수 있어 처분행위와 피해 발생을 특정할 수 있습니다."],
      ["능력 또는 의사", "피고소인이 처음부터 변제하거나 이행할 능력 또는 의사가 없었다고 볼 사정이 있어 편취 의심 사정을 뒷받침할 수 있습니다."],
    ],
    assault: [
      ["방법, 부위, 횟수", "피고소인이 폭행한 방법, 피해 부위, 횟수를 설명할 수 있어 폭행 또는 상해 행위를 특정할 수 있습니다."],
      ["진단서", "상처, 통증, 치료내역 또는 진단서가 있어 피해 결과를 뒷받침할 수 있습니다."],
      ["현장 증거", "목격자, CCTV, 사진, 신고내역 등 현장 증거가 있어 당시 상황을 확인할 수 있습니다."],
    ],
    threat: [
      ["원문", "피고소인이 한 협박성 말이나 메시지의 원문이 있어 해악 고지 내용을 확인할 수 있습니다."],
      ["요구한 내용", "피고소인이 돈, 물건 또는 특정 행동을 요구한 내용이 있어 협박 또는 공갈의 목적을 뒷받침할 수 있습니다."],
      ["불안, 공포", "고소인이 협박 때문에 돈을 주거나 불안과 공포를 느낀 사정이 있어 피해 정도를 설명할 수 있습니다."],
    ],
    defamation: [
      ["원문", "문제가 된 표현의 원문, 캡처 또는 URL이 있어 발언 내용을 특정할 수 있습니다."],
      ["여러 사람이", "게시글이나 발언을 여러 사람이 볼 수 있었던 사정이 있어 공연성을 뒷받침할 수 있습니다."],
      ["가리킨다는", "그 표현이 고소인을 가리킨다는 사정이 있어 피해자를 특정할 수 있습니다."],
    ],
    embezzlement: [
      ["보관하거나 관리", "피고소인이 돈이나 물건을 보관하거나 관리하는 지위에 있었던 사정이 있어 보관자 지위를 설명할 수 있습니다."],
      ["다르게 사용", "피고소인이 정해진 용도와 다르게 사용한 사정이 있어 횡령 또는 배임의 경위를 뒷받침할 수 있습니다."],
      ["손해액", "손해액, 계좌내역, 회계자료 등으로 피해 규모를 설명할 수 있습니다."],
    ],
    stalking: [
      ["날짜와 횟수", "연락, 접근, 기다림 또는 감시가 반복된 날짜와 횟수가 있어 반복성을 설명할 수 있습니다."],
      ["거부 의사", "고소인이 그만하라는 거부 의사를 표시한 기록이 있어 상대방이 이를 알았다는 사정을 뒷받침할 수 있습니다."],
      ["불안감", "불안감, 생활상 피해 또는 신변보호 필요성이 있어 피해 정도를 설명할 수 있습니다."],
    ],
    cyber: [
      ["URL", "피해가 발생한 사이트, 앱, 계정 또는 URL을 알고 있어 사건 발생 경로를 특정할 수 있습니다."],
      ["캡처", "접속기록, 결제내역, 대화내역 또는 화면 캡처가 있어 피해 발생 과정을 확인할 수 있습니다."],
      ["금전 피해", "개인정보, 계정 또는 금전 피해가 발생해 구체적인 피해 결과를 설명할 수 있습니다."],
    ],
    business: [
      ["정상적인 업무", "정상적으로 진행되던 업무가 피고소인의 행위로 어떻게 방해되었는지 설명할 수 있어 업무방해 행위를 특정할 수 있습니다."],
      ["반복되거나 계획적", "방해 행위가 반복되거나 계획적으로 이루어진 정황이 있어 우발적 행위가 아니라는 점을 뒷받침할 수 있습니다."],
      ["매출 손실", "매출 손실, 고객 이탈, 업무 중단 기록이 있어 업무방해로 인한 피해 결과를 설명할 수 있습니다."],
    ],
  };

  const matched = (rules[caseTypeId] || []).find(([keyword]) => text.includes(keyword));
  return matched ? matched[1] : `${text} 이 사정은 범죄사실을 뒷받침하는 보강 내용으로 함께 제출합니다.`;
}

function buildReasonSection(data, evidenceItems) {
  const caseType = valueOr(data.caseTypeName, "형사사건");
  const damage = valueOr(data.damage, "피해");
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
  const rows = evidenceItems.length
    ? evidenceItems.map((item, index) => `${index + 1}) ${item} / 작성자 또는 보관자: [직접 기재] / 입증하려는 내용: [직접 기재] / 제출 유무: ☑ 접수시 제출 □ 수사 중 제출`)
    : ["1) [증거명] / 작성자 또는 보관자: [직접 기재] / 입증하려는 내용: [직접 기재] / 제출 유무: □ 접수시 제출 □ 수사 중 제출"];

  return [
    "[별지] 증거자료 세부 목록",
    "",
    "1. 인적증거 (목격자, 참고인 등)",
    "성명: [참고인 성명] / 연락처: [연락처] / 고소인과의 관계: [관계] / 입증하려는 내용: [무엇을 보았거나 알고 있는지]",
    "",
    "2. 증거서류·사진·전자자료",
    ...rows,
    "",
    "3. 증거물",
    "1) [증거물] / 소유자 또는 보관자: [소유자] / 입증하려는 내용: [직접 기재] / 제출 유무: □ 접수시 제출 □ 수사 중 제출",
    "",
    "4. 기타 증거",
    "[수사기관이 확보할 필요가 있는 CCTV 위치, 플랫폼 기록, 통신기록, 계좌 추적 필요성 등을 기재]",
  ].join("\n");
}

function buildCautions(data, evidenceItems) {
  const missing = findMissingInfo(data).filter((item) => item !== "현재 입력 기준으로 핵심 항목은 채워져 있습니다.");
  const lines = ["제출 전 확인사항"];
  if (missing.length) lines.push(`- 보완 필요: ${missing.join(", ")}`);
  if (!evidenceItems.length) lines.push("- 증거자료 목록과 실제 첨부자료를 반드시 맞춰 주세요.");
  lines.push("- 확실하지 않은 내용은 단정하지 말고 '[확인 필요]'로 남겨 주세요.");
  lines.push("- 주민등록번호, 서명, 제출일, 관할 경찰서 또는 검찰청은 제출 직전에 직접 확인해 주세요.");
  return lines.join("\n");
}

function getCaseTypeRequirements(data) {
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
  return byType[data.caseTypeId] || ["상대방의 구체적인 말과 행동", "피해 발생 경위", "피해 결과", "이를 뒷받침할 증거"];
}

function splitEvidence(value) {
  return String(value || "")
    .split(/[,，、\/\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function localMeta() {
  const payload = getPayload();
  return {
    missingInfo: buildHelpfulChecklist(payload),
    precedentQueries: buildPrecedentQueries(getSelectedType()),
  };
}

function buildHelpfulChecklist(data) {
  const missing = findMissingInfo(data);
  const items = missing.map((item) => item.startsWith("현재 ") ? item : `보완 필요: ${item}`);
  const checked = Array.isArray(data.checkedQuestions) ? data.checkedQuestions : [];

  if (data.caseTypeName) {
    items.push(`${data.caseTypeName} 핵심 확인: ${getCaseTypeRequirements(data).join(" / ")}`);
  }

  if (checked.length) {
    items.push(`범죄사실에 반영될 보강 사실: ${checked.join(" / ")}`);
  } else {
    items.push("보강 체크: 확실히 설명할 수 있는 항목만 체크하면 범죄사실에 반영됩니다.");
  }

  return items;
}

function findMissingInfo(data) {
  const labels = [
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
  const missing = labels.filter(([key]) => !String(data[key] || "").trim()).map(([, label]) => label);
  return missing.length ? missing : ["현재 입력 기준으로 핵심 항목은 채워져 있습니다."];
}

function buildPrecedentQueries(type) {
  const crimeName = String(type?.name || "형사").trim();
  const keywords = [...new Set([crimeName, ...(type?.lawKeywords || [])])]
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean)
    .filter((keyword, index, list) => list.indexOf(keyword) === index);
  const focused = keywords
    .filter((keyword) => keyword !== crimeName)
    .slice(0, 3);
  const lawQueries = [
    [crimeName, focused[0]].filter(Boolean).join(" "),
    [crimeName, focused[1] || "구성요건"].filter(Boolean).join(" "),
    [crimeName, focused[2] || "증거"].filter(Boolean).join(" "),
  ].filter(Boolean);
  const uniqueQueries = [...new Set(lawQueries)];
  return [
    ...uniqueQueries.map((query) => ({
      label: `국가법령정보센터: ${query}`,
      url: `https://www.law.go.kr/LSW/precSc.do?query=${encodeURIComponent(query)}`,
      help: "새 창에서 판례 검색 결과를 확인하세요.",
    })),
    {
      label: `구글 보조검색: ${crimeName} 판례`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:law.go.kr ${crimeName} 판례`)}`,
      help: "공식 검색이 약할 때 보조로 사용하세요.",
    },
  ];
}

function renderDraft(text, meta = {}) {
  editor.value = text || "";
  editor.scrollTop = 0;
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
    li.className = "precedent-item";
    const link = document.createElement("a");
    link.href = item.url || "https://www.law.go.kr/LSW/precSc.do";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "precedent-link";
    link.textContent = item.label || item;
    li.append(link);
    if (item.help) {
      const help = document.createElement("small");
      help.className = "precedent-help";
      help.textContent = item.help;
      li.append(help);
    }
    precedentList.append(li);
  }
}

function getCheckedQuestions() {
  return getQuestionAnswers().filter((item) => item.answer).map((item) => item.question);
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
  controls.generate.textContent = isLoading ? "작성 중" : "고소장 만들기";
}

function valueOr(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

renderQuestions = function (savedAnswers = []) {
  const saved = Array.isArray(savedAnswers) ? savedAnswers : [];
  questions.innerHTML = "";
  for (const [index, text] of (getSelectedType().questions || []).entries()) {
    const savedItem = saved.find((item) => item?.question === text || item?.index === index || item === text);
    const item = document.createElement("label");
    item.className = "question-item question-answer-item";
    const span = document.createElement("span");
    span.textContent = text;
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.dataset.questionIndex = String(index);
    textarea.dataset.question = text;
    textarea.placeholder = "아는 만큼만 적어주세요. 모르면 비워도 됩니다.";
    textarea.value = typeof savedItem === "string" ? "" : savedItem?.answer || "";
    item.append(span, textarea);
    questions.append(item);
  }
  autoResizeTextareas();
};

generateDraft = async function () {
  const payload = getPayload();
  setLoading(true);
  statusText.textContent = "유형별 질문과 증거를 범죄사실에 반영하는 중입니다.";

  try {
    const draftApiUrl = getDraftApiUrl();
    const response = await fetch(draftApiUrl, {
      method: "POST",
      headers: { "Content-Type": draftApiUrl.startsWith("http") ? "text/plain;charset=utf-8" : "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "초안 생성에 실패했습니다.");
    renderDraft(result.draftText, result);
    autoSave();
    statusText.textContent = result.usedAi
      ? "고소장 초안을 제출용 흐름으로 생성했습니다. 제출 전 사실관계를 확인하세요."
      : "입력한 내용만으로 고소장 초안을 생성했습니다.";
  } catch (error) {
    renderDraft(localDraft(), localMeta());
    statusText.textContent = `${error.message} 입력한 내용 기준 초안으로 대체했습니다.`;
  } finally {
    setLoading(false);
  }
};

getPayload = function () {
  const data = Object.fromEntries(new FormData(form).entries());
  const type = getSelectedType();
  return {
    ...data,
    caseTypeId: type.id,
    caseTypeName: type.name,
    lawKeywords: type.lawKeywords || [],
    questions: type.questions || [],
    questionAnswers: getQuestionAnswers(),
    checkedQuestions: getQuestionAnswers().filter((item) => item.answer).map((item) => item.question),
  };
};

buildComplaintDraft = function (data, ai = {}) {
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const evidenceList = buildEvidenceList(data);
  const facts = generateCrimeFacts(data);
  const accusedClue = compactText([data.accusedContact, data.accusedAddress, data.accusedClue], " / ");

  return [
    "고 소 장",
    "",
    "1. 고소인",
    `성명: ${valueOr(data.complainant, "[고소인 성명]")}`,
    `주소: ${valueOr(data.complainantAddress, "[고소인 주소]")}`,
    `연락처: ${valueOr(data.complainantPhone, "[고소인 연락처]")}`,
    "",
    "2. 피고소인",
    `성명: ${valueOr(data.accused, "성명불상자")}`,
    `주소: ${valueOr(data.accusedAddress, "추후 확인 필요")}`,
    `연락처 또는 특정 단서: ${valueOr(accusedClue, "추후 확인 필요")}`,
    "",
    "3. 고소취지",
    ai.purpose || buildPurpose(data),
    "",
    "4. 범죄사실",
    facts,
    "",
    "5. 고소이유",
    ai.reason || buildReasonSection(data, evidenceList),
    "",
    "6. 증거자료",
    ai.evidence || formatEvidenceList(evidenceList),
    "",
    "7. 관련 사건",
    valueOr(data.relatedCase, "관련 신고, 고소, 민사소송, 합의 또는 변제 여부는 추후 확인 필요"),
    "",
    "8. 첨부자료",
    buildAttachmentList(evidenceList.map((item) => item.title)),
    "",
    "9. 작성일",
    today,
    "",
    "10. 고소인",
    `성명: ${valueOr(data.complainant, "[고소인 성명]")}`,
    "서명 또는 날인: ____________________",
    "",
    "제출 전 확인사항",
    buildCautions(data, evidenceList),
    "",
    "안내: 이 문서는 사용자가 입력한 내용을 바탕으로 자동 생성된 고소장 초안입니다. 실제 제출 전 사실관계, 증거자료, 관할 수사기관, 법률적 쟁점을 반드시 확인하시기 바랍니다.",
  ].join("\n");
};

normalizeFactSection = function (value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const required = ["가. 피고소인 특정", "나. 범행 일시 및 장소", "다. 범행 방법 및 구체적 행위", "라. 피해 결과", "마. 증거와의 연결"];
  return required.every((title) => text.includes(title)) ? text : "";
};

buildPurpose = function (data) {
  const caseType = data.caseTypeId === "other" ? "아래 피해 사실" : `${valueOr(data.caseTypeName, "관련 범죄")} 혐의`;
  if (data.caseTypeId === "other") {
    return "고소인은 아래와 같은 피해 사실에 관하여 피고소인을 수사하여 처벌하여 주시기 바랍니다.";
  }
  return `고소인은 피고소인을 ${caseType}로 고소하오니, 철저히 수사하여 처벌하여 주시기 바랍니다.`;
};

var generateComplaint = function (input) {
  return buildComplaintDraft(input);
};

var generateCrimeFacts = function (input) {
  return buildFactSection(input, buildEvidenceList(input));
};

buildFactSection = function (data, evidenceList) {
  const elements = mapElementsByCrimeType(data.caseTypeId, data);
  const timePlace = buildTimePlaceSentence(data);
  return [
    "가. 피고소인 특정",
    buildAccusedSpecificLine(data),
    "",
    "나. 범행 일시 및 장소",
    timePlace,
    "",
    "다. 범행 방법 및 구체적 행위",
    buildActionParagraph(data, elements),
    "",
    "라. 피해 결과",
    buildDamageParagraph(data, elements),
    "",
    "마. 증거와의 연결",
    buildEvidenceConnection(data, evidenceList, elements),
  ].join("\n");
};

function buildAccusedSpecificLine(data) {
  const name = valueOr(data.accused, "성명불상자");
  const clues = compactText([data.accusedContact, data.accusedAddress, data.accusedClue], ", ");
  const base = clues
    ? `피고소인은 ${name}이며, 현재 확인 가능한 특정 단서는 ${clues}입니다.`
    : `피고소인은 ${name}이며, 구체적인 인적사항은 추후 확인 필요합니다.`;
  if (/성명불상|불상|미상|모름/u.test(name)) {
    return `${base} 다만 대화내역, 계좌정보, 계정명, 전화번호, CCTV, 플랫폼 기록 등으로 피고소인을 특정할 필요가 있습니다.`;
  }
  return base;
}

function buildActionParagraph(data, elements) {
  const story = String(data.story || "").trim();
  const answers = formatQuestionAnswers(data);
  const lines = [story, answers].filter(Boolean);
  return lines.length ? lines.join("\n") : "피고소인의 구체적 행위는 추후 확인 필요합니다.";
}

function buildDamageParagraph(data, elements) {
  const damage = compactText([data.damage, data.damageDetail], " / ");
  return damage
    ? `그 결과 고소인은 ${damage}의 피해를 입었습니다.`
    : "그 결과 발생한 구체적인 피해 내용과 피해 정도는 추후 확인 필요합니다.";
}

function buildEvidenceConnection(data, evidenceList, elements) {
  if (!evidenceList.length) {
    return "현재 제출 예정 증거자료는 기재되지 않았습니다. 범죄사실을 뒷받침할 자료는 추후 확인 필요합니다.";
  }
  return evidenceList
    .map((item, index) => `${index + 1}. ${item.title}: ${valueOr(item.description, "위 범죄사실 관련 자료")} 위 자료로 확인되는 내용은 ${valueOr(item.proves, "피고소인의 행위 및 피해 발생 경위")}입니다.`)
    .join("\n");
}

buildTimePlaceSentence = function (data) {
  const date = normalizeUnknown(data.incidentDate);
  const place = normalizeUnknown(data.incidentPlace);
  if (date !== "추후 확인 필요" && place !== "추후 확인 필요") {
    return `피고소인은 ${date} ${place}에서 아래와 같은 행위를 하였습니다.`;
  }
  if (date !== "추후 확인 필요") {
    return `피고소인은 ${date} 장소 불상지 또는 추후 확인되는 장소에서 아래와 같은 행위를 하였습니다.`;
  }
  if (place !== "추후 확인 필요") {
    return `피고소인은 정확한 일시를 알 수 없는 때에 ${place}에서 아래와 같은 행위를 하였습니다.`;
  }
  return "범행 일시와 장소는 현재 자료만으로 특정하기 어려우며, 추후 확인 필요합니다.";
}

function getTypeActionGuide(caseTypeId, elements) {
  const guides = {
    fraud: "사기 사건에서는 피고소인의 기망행위, 고소인이 그 말을 믿게 된 경위, 송금 또는 재산 처분행위, 피해금액, 처음부터 이행 의사나 능력이 없었다고 볼 사정을 구체적으로 적습니다.",
    embezzlement: "횡령 사건에서는 피고소인이 재산을 보관하게 된 경위, 소유자, 반환 또는 정산 의무, 임의 사용이나 반환 거부 정황을 구체적으로 적습니다.",
    breach: "배임 사건에서는 피고소인이 부담한 임무, 그 임무를 위반한 행위, 피고소인 또는 제3자의 이익, 고소인의 손해를 구체적으로 적습니다.",
    defamation: "명예훼손 사건에서는 문제 표현의 원문, 게시 위치, 공개 범위, 고소인이 특정되는 이유, 허위라고 보는 근거를 구체적으로 적습니다.",
    insult: "모욕 사건에서는 모욕 표현의 원문, 발언 또는 게시 일시와 장소, 공개 범위, 고소인이 특정되는 이유를 구체적으로 적습니다.",
    threat: "협박 사건에서는 피고소인이 고지한 해악의 내용, 전달 방식, 고소인이 공포심을 느낀 사정, 반복 여부를 구체적으로 적습니다.",
    extortion: "공갈 사건에서는 협박 또는 압박의 내용, 요구한 재산상 이익, 실제 제공한 금액과 방식, 제공하게 된 경위를 구체적으로 적습니다.",
    assault: "폭행 사건에서는 신체 접촉 또는 유형력 행사 방법, 피해 부위, 현장 상황, 목격자나 CCTV 여부를 구체적으로 적습니다.",
    injury: "상해 사건에서는 폭행 방법, 발생한 상처, 진단명, 치료 기간, 병원명, 진단서 또는 치료비 자료를 구체적으로 적습니다.",
    property_damage: "재물손괴 사건에서는 손괴된 물건, 소유자, 손괴 방법, 수리비 또는 교체비, 사진이나 견적서 자료를 구체적으로 적습니다.",
    business: "업무방해 사건에서는 정상 업무의 내용, 허위사실 유포·위력·위계 중 어떤 방식으로 방해했는지, 실제 업무 지장 결과를 구체적으로 적습니다.",
    stalking: "스토킹 사건에서는 반복 연락, 접근, 기다림, 감시, 물건 전달 등 구체적 행위와 날짜, 횟수, 거부 의사, 불안감 또는 공포심을 구체적으로 적습니다.",
    trespass: "주거침입 사건에서는 침입 장소, 주거 또는 관리 공간 여부, 들어온 방식, 허락이 없었거나 퇴거 요구를 거부한 사정을 구체적으로 적습니다.",
    cyber: "사이버범죄에서는 사이트·앱·URL·계정명, 피싱 또는 계정탈취 경로, 결제나 송금 피해, 전자증거를 구체적으로 적습니다.",
    other: "기타 사건에서는 죄명을 단정하지 않고 일시, 장소, 방법, 피해, 증거가 특정되도록 확인 가능한 사실을 적습니다.",
  };
  return guides[caseTypeId] || guides.other;
}

var mapElementsByCrimeType = function (crimeType, input) {
  const answerText = [input.story, ...getQuestionAnswersFromPayload(input).map((item) => item.answer)].join(" ");
  const base = {
    evidenceGuide: "증거자료는 해당 사실을 입증하는 취지와 연결해 정리해야 합니다.",
    damagePoint: "",
    answerText,
  };
  const byType = {
    fraud: { damagePoint: "송금일, 금액, 계좌, 물품 또는 권리 이전 내용, 반환 요구와 미이행 경과를 함께 확인해야 합니다.", evidenceGuide: "대화 캡처, 송금내역, 계약서, 판매글, 녹취는 기망행위와 처분행위 및 피해금액을 입증합니다." },
    defamation: { damagePoint: "게시물로 인한 사회적 평가 저하, 항의 연락, 업무 또는 인간관계 피해를 함께 확인해야 합니다.", evidenceGuide: "게시글 캡처, URL, 댓글, 조회수, 대화방 캡처는 표현 원문, 공연성, 특정성을 입증합니다." },
    insult: { damagePoint: "모욕 표현으로 인한 정신적 피해와 공개된 범위를 함께 확인해야 합니다.", evidenceGuide: "캡처, URL, 대화방 참여자, 녹취는 표현 원문과 공연성을 입증합니다." },
    assault: { damagePoint: "피해 부위, 통증, 신고 여부, 현장 상황을 함께 확인해야 합니다.", evidenceGuide: "상처 사진, CCTV, 목격자, 신고내역은 폭행 방법과 피해 부위를 입증합니다." },
    injury: { damagePoint: "진단명, 치료 기간, 병원명, 치료비를 함께 확인해야 합니다.", evidenceGuide: "진단서, 치료비 영수증, 상처 사진, CCTV는 상해 발생과 치료 내역을 입증합니다." },
    stalking: { damagePoint: "불안감, 공포심, 생활상 피해, 보호조치 필요성을 함께 확인해야 합니다.", evidenceGuide: "통화기록, 메시지, CCTV, 위치기록은 반복성, 거부 의사, 불안감을 입증합니다." },
    business: { damagePoint: "업무 중단 시간, 매출 손실, 고객 이탈, 직원 대응 내용을 함께 확인해야 합니다.", evidenceGuide: "CCTV, 녹취, 매출자료, 예약 취소 내역, 민원기록은 업무방해 행위와 손해를 입증합니다." },
    embezzlement: { damagePoint: "반환 요구, 정산 의무, 미반환 금액과 산정 근거를 함께 확인해야 합니다.", evidenceGuide: "계좌내역, 계약서, 정산자료, 메시지는 보관 경위와 반환 의무, 임의 사용을 입증합니다." },
    breach: { damagePoint: "임무 위반으로 생긴 손해와 상대방 또는 제3자가 얻은 이익을 함께 확인해야 합니다.", evidenceGuide: "계약서, 약정서, 업무자료, 회계자료는 임무와 위반행위, 손해를 입증합니다." },
    threat: { damagePoint: "공포심, 생활상 제한, 반복 연락 여부를 함께 확인해야 합니다.", evidenceGuide: "문자, 카카오톡, 녹취, 통화기록은 해악 고지 원문과 전달 방식을 입증합니다." },
    extortion: { damagePoint: "제공한 돈, 물건, 권리 또는 재산상 이익의 일시와 방식을 함께 확인해야 합니다.", evidenceGuide: "협박 메시지, 녹취, 송금내역, 대화내역은 압박과 재산상 이익 제공을 입증합니다." },
    property_damage: { damagePoint: "수리비, 교체비, 견적서, 물건의 소유관계를 함께 확인해야 합니다.", evidenceGuide: "사진, 견적서, CCTV, 블랙박스는 손괴 물건과 손괴 방법을 입증합니다." },
    trespass: { damagePoint: "주거 평온 침해, 퇴거 요구, 반복 출입 여부를 함께 확인해야 합니다.", evidenceGuide: "CCTV, 출입기록, 목격자 진술, 사진은 무단 출입과 퇴거 거부를 입증합니다." },
    cyber: { damagePoint: "금전 피해, 계정 탈취, 개인정보 유출, 복구 비용을 함께 확인해야 합니다.", evidenceGuide: "URL, 접속기록, 결제내역, 문자, 이메일, 화면 캡처는 온라인 피해 경로와 피해액을 입증합니다." },
  };
  return { ...base, ...(byType[crimeType] || {}) };
};

function getQuestionAnswers() {
  return [...questions.querySelectorAll("textarea[data-question]")].map((textarea, index) => ({
    index,
    question: textarea.dataset.question || "",
    answer: textarea.value.trim(),
  }));
}

function getQuestionAnswersFromPayload(data) {
  return Array.isArray(data.questionAnswers) ? data.questionAnswers : [];
}

function formatQuestionAnswers(data) {
  const answers = getQuestionAnswersFromPayload(data).filter((item) => item.answer);
  if (!answers.length) return "";
  return ["고소인은 추가로 다음과 같이 진술합니다.", ...answers.map((item, index) => `${index + 1}) ${trimQuestion(item.question)}: ${item.answer}`)].join("\n");
}

function trimQuestion(value) {
  return String(value || "").replace(/[?？]\s*$/u, "").trim();
}

var normalizeUnknown = function (value) {
  const text = String(value || "").trim();
  if (!text || /^(모름|몰라|기억 안 남|기억안남|미상|불명|없음)$/u.test(text)) return "추후 확인 필요";
  return text;
};

function buildEvidenceList(data) {
  const titles = splitEvidence(data.evidence);
  const descriptions = String(data.evidenceDescription || "").split(/\n|;/u).map((item) => item.trim()).filter(Boolean);
  if (!titles.length && !descriptions.length) return [];
  const length = Math.max(titles.length, descriptions.length);
  return Array.from({ length }, (_, index) => ({
    title: titles[index] || `증거자료 ${index + 1}`,
    date: "",
    description: descriptions[index] || descriptions[0] || "",
    proves: inferEvidenceProves(data.caseTypeId, titles[index] || "", descriptions[index] || ""),
    fileName: "",
  }));
}

var formatEvidenceList = function (evidenceList) {
  if (!evidenceList.length) {
    return "1) 증거명: 추후 확인 필요\n   입증하려는 사실: 피고소인의 구체적 행위, 피해 발생, 피해 결과를 입증할 자료를 정리해야 합니다.";
  }
  return evidenceList.map((item, index) => `${index + 1}) 증거명: ${item.title}\n   입증하려는 사실: ${valueOr(item.proves, item.description || "추후 확인 필요")}`).join("\n");
};

function inferEvidenceProves(caseTypeId, title, description) {
  const text = `${title} ${description}`;
  if (/송금|계좌|이체|입금|결제/u.test(text)) return "금전 지급, 피해금액, 재산 처분행위";
  if (/카카오|문자|대화|메시지|녹취|통화/u.test(text)) return "피고소인의 말, 요구, 약속 또는 해악 고지 원문";
  if (/캡처|URL|게시|댓글|화면/u.test(text)) return "게시 위치, 표현 원문, 온라인 피해 경로";
  if (/진단|병원|치료|상처/u.test(text)) return "상해 발생, 피해 부위, 치료 기간";
  if (/CCTV|블랙박스|목격/u.test(text)) return "현장 상황과 피고소인의 행위";
  const byType = {
    fraud: "기망행위, 처분행위, 피해금액",
    defamation: "표현 원문, 공연성, 피해자 특정성",
    assault: "폭행 방법, 피해 부위, 현장 상황",
    stalking: "반복성, 거부 의사, 불안감",
  };
  return byType[caseTypeId] || "범죄사실과 피해 결과";
}

buildReasonSection = function (data, evidenceList) {
  const intent = valueOr(data.punishmentIntent, "고소인은 피고소인의 처벌을 원합니다.");
  return [
    `고소인은 위 범죄사실과 같이 ${valueOr(data.caseTypeName, "형사사건")} 관련 피해를 입었습니다.`,
    `이 사건은 피고소인의 구체적인 행위, 피해 발생 경위, 피해 결과를 확인할 필요가 있고, ${evidenceList.length ? "제출 예정 증거자료로 주요 사실을 확인할 수 있습니다." : "관련 증거자료를 추가로 정리할 예정입니다."}`,
    intent,
    "따라서 피고소인을 조사하고, 필요한 경우 계좌내역, 통신내역, CCTV, 플랫폼 기록, 참고인 진술 등을 확인하여 법에 따라 처리하여 주시기 바랍니다.",
  ].join("\n");
};

buildCautions = function (data, evidenceList) {
  const missing = checkMissingFields(data);
  const lines = [];
  if (missing.length) {
    lines.push("[보완 필요]");
    lines.push(...missing.map((item) => `- ${item}`));
  } else {
    lines.push("[보완 필요]");
    lines.push("- 현재 입력 기준으로 핵심 항목은 채워져 있습니다. 제출 전 원본 증거와 날짜를 다시 확인하세요.");
  }
  if (!evidenceList.length) lines.push("- 증거자료가 비어 있습니다. 고소장 접수 전 실제 첨부자료를 정리하세요.");
  lines.push("- 확실하지 않은 내용은 단정하지 말고 '추후 확인 필요'로 남기세요.");
  lines.push("- 주민등록번호, 서명 또는 날인, 제출일, 관할 경찰서 또는 검찰청은 제출 직전에 직접 확인하세요.");
  return lines.join("\n");
};

var checkMissingFields = function (data) {
  const missing = [];
  const accusedKnown = [data.accused, data.accusedContact, data.accusedAddress, data.accusedClue].some((value) => String(value || "").trim());
  const common = [
    [data.complainant, "고소인 성명이 없습니다."],
    [data.complainantAddress, "고소인 주소가 없습니다."],
    [data.complainantPhone, "고소인 연락처가 없습니다."],
    [accusedKnown, "피고소인 성명, 연락처, 주소, 계정, 계좌번호 등 특정 단서가 없습니다."],
    [data.incidentDate, "사건 일시가 구체적이지 않습니다. 가능한 날짜 범위라도 입력하세요."],
    [data.incidentPlace, "사건 장소가 없습니다. 장소는 관할 수사기관과 범죄사실 특정에 도움이 됩니다."],
    [data.story, "피해사실 작성이 부족합니다. 실제로 한 말, 보낸 메시지, 받은 돈, 폭행 방법 등을 시간순으로 적으세요."],
    [data.damage || data.damageDetail, "피해 내용이 없습니다. 피해금액, 치료기간, 수리비, 영업손실 등을 적으세요."],
    [data.evidence || data.evidenceDescription, "증거자료가 없습니다. 증거명과 입증하려는 사실을 함께 적으세요."],
  ];
  for (const [value, label] of common) {
    if (!value || !String(value).trim()) missing.push(label);
  }
  missing.push(...typeSpecificMissing(data));
  return [...new Set(missing)];
};

findMissingInfo = function (data) {
  const missing = checkMissingFields(data);
  return missing.length ? missing : ["현재 입력 기준으로 핵심 항목은 채워져 있습니다."];
};

function typeSpecificMissing(data) {
  const text = [data.story, data.damage, data.evidence, data.evidenceDescription, ...getQuestionAnswersFromPayload(data).map((item) => `${item.question} ${item.answer}`)].join(" ");
  const groups = {
    fraud: [["거짓말|기망|속|약속|판매|투자", "사기: 피고소인이 한 거짓말 또는 믿게 만든 자료가 부족합니다."], ["송금|이체|입금|전달|결제|물건", "사기: 돈이나 재산을 넘긴 날짜, 금액, 방법이 부족합니다."], ["금액|원|만원", "사기: 피해금액이 구체적이지 않습니다."], ["대화|송금|계좌|캡처|계약|판매글", "사기: 기망행위와 송금 사실을 뒷받침할 증거 설명이 부족합니다."]],
    defamation: [["원문|게시|댓글|발언|표현", "명예훼손: 문제된 표현의 원문이 부족합니다."], ["URL|게시판|단체방|공개|조회|댓글", "명예훼손: 게시 위치와 공개 범위가 부족합니다."], ["실명|별명|사진|계정|특정", "명예훼손: 고소인이 특정되는 이유가 부족합니다."]],
    assault: [["때리|밀|잡|차|폭행|부위|얼굴|팔|다리", "폭행: 폭행 방법과 피해 부위가 부족합니다."], ["CCTV|목격|사진|신고|112", "폭행: 현장 증거 또는 신고 여부가 부족합니다."]],
    injury: [["진단|치료|병원|상처|전치|골절", "상해: 진단명, 치료 기간, 병원명 또는 상처 설명이 부족합니다."]],
    embezzlement: [["보관|관리|맡|정산|반환", "횡령: 보관 경위와 반환 또는 정산 의무가 부족합니다."], ["임의|사용|거부|연락두절", "횡령: 임의 사용 또는 반환 거부 정황이 부족합니다."]],
    stalking: [["반복|횟수|전화|문자|접근|기다|감시|방문", "스토킹: 반복 행위의 날짜와 횟수가 부족합니다."], ["거부|그만|연락하지", "스토킹: 거부 의사 표시 내용이 부족합니다."], ["불안|공포|두려|생활", "스토킹: 불안감 또는 생활상 피해 설명이 부족합니다."]],
  };
  return (groups[data.caseTypeId] || []).filter(([pattern]) => !new RegExp(pattern, "u").test(text)).map(([, message]) => message);
}

getCaseTypeRequirements = function (data) {
  const byType = {
    fraud: ["거짓말 내용", "착오", "송금 또는 처분행위", "피해금액", "증거"],
    embezzlement: ["보관 경위", "소유자", "반환 의무", "임의 사용", "증거"],
    breach: ["임무", "의무 위반", "상대방 이익", "고소인 손해", "계약·업무자료"],
    defamation: ["표현 원문", "게시 위치", "공개 범위", "피해자 특정성", "증거"],
    insult: ["모욕 표현 원문", "공연성", "피해자 특정성", "증거"],
    threat: ["해악 고지 원문", "전달 방식", "공포심", "반복 여부", "증거"],
    extortion: ["협박 또는 압박", "재산상 이익 요구", "제공 일시·금액·방식", "증거"],
    assault: ["폭행 방법", "피해 부위", "일시·장소", "목격자·CCTV", "증거"],
    injury: ["폭행 방법", "상처", "진단명", "치료 기간", "증거"],
    property_damage: ["손괴 물건", "소유자", "손괴 방법", "수리비", "증거"],
    business: ["정상 업무", "위계·위력·허위사실", "업무 지장", "손실", "증거"],
    stalking: ["반복성", "거부 의사", "불안감", "신고 이력", "증거"],
    trespass: ["침입 장소", "주거 또는 관리 공간", "침입 방식", "허락 없음 또는 퇴거 거부", "증거"],
    cyber: ["사이트·앱·URL", "계정·닉네임", "피해 유형", "피해 일시·금액", "전자증거"],
    other: ["일시", "장소", "방법", "피해", "증거"],
  };
  return byType[data.caseTypeId] || byType.other;
};

buildHelpfulChecklist = function (data) {
  const missing = findMissingInfo(data);
  const items = missing.map((item) => item.startsWith("현재 ") ? item : `보완 필요: ${item}`);
  items.push(`${valueOr(data.caseTypeName, "선택한 범죄유형")} 핵심 확인: ${getCaseTypeRequirements(data).join(" / ")}`);
  const answered = getQuestionAnswersFromPayload(data).filter((item) => item.answer).length;
  items.push(answered ? `유형별 질문 답변 ${answered}개가 범죄사실에 반영됩니다.` : "유형별 질문 답변이 비어 있습니다. 아는 내용만 적으면 범죄사실이 더 구체화됩니다.");
  return items;
};

saveDraft = function () {
  const saved = {
    savedAt: new Date().toISOString(),
    selectedCaseType,
    formData: getPayload(),
    questionAnswers: getQuestionAnswers(),
    draftText: editor.value,
  };
  localStorage.setItem(draftStorageKey, JSON.stringify(saved));
  statusText.textContent = "현재 입력 내용과 초안을 이 브라우저에 저장했습니다.";
};

loadDraft = function () {
  const raw = localStorage.getItem(draftStorageKey);
  if (!raw) {
    statusText.textContent = "저장된 초안이 없습니다.";
    return;
  }
  try {
    const saved = JSON.parse(raw);
    selectedCaseType = saved.selectedCaseType || "fraud";
    renderCaseTypes();
    setFormValues(saved.formData || {});
    renderQuestions(saved.questionAnswers || saved.formData?.questionAnswers || saved.checkedQuestions || []);
    renderDraft(saved.draftText || localDraft(), localMeta());
    statusText.textContent = `${saved.savedAt ? new Date(saved.savedAt).toLocaleString("ko-KR") : "저장된"} 초안을 불러왔습니다.`;
  } catch {
    statusText.textContent = "저장된 초안을 읽지 못했습니다.";
  }
};

autoSave = function () {
  const saved = {
    savedAt: new Date().toISOString(),
    selectedCaseType,
    formData: getPayload(),
    questionAnswers: getQuestionAnswers(),
    draftText: editor.value,
  };
  localStorage.setItem(autoSaveStorageKey, JSON.stringify(saved));
  if (autoSaveStatus) autoSaveStatus.textContent = "자동 저장됨";
};

restoreAutoSavedState = function () {
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
};

setFormValues = function (data) {
  for (const element of form.elements) {
    if (!element.name || data[element.name] === undefined) continue;
    element.value = data[element.name];
  }
};

async function copyDraft() {
  try {
    await navigator.clipboard.writeText(editor.value);
    statusText.textContent = "고소장 초안을 복사했습니다.";
  } catch {
    editor.select();
    document.execCommand("copy");
    statusText.textContent = "고소장 초안을 복사했습니다.";
  }
}

function autoResizeTextareas(target) {
  const targets = target ? [target] : [...document.querySelectorAll("textarea")];
  for (const textarea of targets) {
    if (textarea.id === "draftEditor") continue;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 78), 900)}px`;
  }
}

function compactText(values, separator) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(separator);
}

const easyCaseCopy = {
  fraud: ["돈을 보냈는데 약속을 지키지 않았어요", "사기 사건에 가까울 수 있습니다."],
  embezzlement: ["맡겨둔 돈이나 물건을 돌려주지 않아요", "횡령 사건에 가까울 수 있습니다."],
  breach: ["맡은 일을 어겨 손해가 생겼어요", "배임 사건에 가까울 수 있습니다."],
  defamation: ["인터넷이나 단톡방에 나에 대한 나쁜 말을 올렸어요", "명예훼손 사건에 가까울 수 있습니다."],
  insult: ["욕설이나 모욕적인 말을 들었어요", "모욕 사건에 가까울 수 있습니다."],
  threat: ["협박을 받았어요", "협박 사건에 가까울 수 있습니다."],
  extortion: ["협박 때문에 돈이나 물건을 줬어요", "공갈 사건에 가까울 수 있습니다."],
  assault: ["맞거나 밀치는 피해를 당했어요", "폭행 사건에 가까울 수 있습니다."],
  injury: ["다쳐서 병원 치료를 받았어요", "상해 사건에 가까울 수 있습니다."],
  property_damage: ["물건이 부서졌어요", "재물손괴 사건에 가까울 수 있습니다."],
  business: ["가게나 업무를 방해받았어요", "업무방해 사건에 가까울 수 있습니다."],
  stalking: ["계속 연락하거나 찾아와서 불안해요", "스토킹 사건에 가까울 수 있습니다."],
  trespass: ["집이나 사무실에 허락 없이 들어왔어요", "주거침입 사건에 가까울 수 있습니다."],
  cyber: ["온라인에서 사기나 계정 피해를 당했어요", "사이버범죄 사건에 가까울 수 있습니다."],
  other: ["잘 모르겠어요", "일단 사실관계 중심으로 정리합니다."],
};

const evidenceTypeOptions = ["카카오톡 대화", "문자 메시지", "통화 녹음", "계좌이체 내역", "계약서", "게시글 캡처", "URL", "CCTV", "블랙박스", "사진", "진단서", "견적서", "목격자", "기타"];

renderCaseTypes = function () {
  grid.innerHTML = "";
  for (const item of caseTypes) {
    const copy = easyCaseCopy[item.id] || [item.name, item.summary];
    const button = document.createElement("button");
    button.className = "case-card";
    button.type = "button";
    button.setAttribute("aria-pressed", String(item.id === selectedCaseType));
    const hint = item.id === selectedCaseType ? `${copy[1]} 선택됨. 다음을 누르세요.` : copy[1];
    button.innerHTML = `<strong>${escapeHtml(copy[0])}</strong><p>${escapeHtml(item.summary || "")}</p><span class="case-hint">${escapeHtml(hint)}</span>`;
    button.addEventListener("click", () => {
      selectedCaseType = item.id;
      renderCaseTypes();
      renderQuestions();
      updateEventSummary();
      syncDraftFromInputs();
      autoSave();
    });
    grid.append(button);
  }
};

renderQuestions = function (savedAnswers = []) {
  const saved = Array.isArray(savedAnswers) ? savedAnswers : [];
  questions.innerHTML = "";
  for (const [index, text] of (getSelectedType().questions || []).entries()) {
    const savedItem = saved.find((item) => item?.question === text || item?.index === index || item === text);
    const item = document.createElement("div");
    item.className = "question-item question-answer-item";
    const title = document.createElement("span");
    title.textContent = text;
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.dataset.questionIndex = String(index);
    textarea.dataset.question = text;
    textarea.dataset.status = savedItem?.status || "";
    textarea.placeholder = "답을 적어주세요. 모르면 아래 버튼을 눌러도 됩니다.";
    textarea.value = typeof savedItem === "string" ? "" : savedItem?.answer || "";
    const status = document.createElement("div");
    status.className = "answer-status";
    status.textContent = textarea.dataset.status ? `표시: ${textarea.dataset.status}` : "";
    const actions = document.createElement("div");
    actions.className = "question-actions";
    [
      ["잘 모르겠어요", "추후 확인 필요", "잘 모르겠어요"],
      ["나중에 입력할게요", "", "나중에 입력"],
      ["해당 없어요", "해당 없음", "해당 없음"],
    ].forEach(([label, value, state]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        textarea.value = value;
        textarea.dataset.status = state;
        status.textContent = `표시: ${state}`;
        autoResizeTextareas(textarea);
        syncDraftFromInputs();
        autoSave();
      });
      actions.append(button);
    });
    item.append(title, textarea, actions, status);
    questions.append(item);
  }
  autoResizeTextareas();
};

getPayload = function () {
  syncEvidenceTextFields();
  const data = Object.fromEntries(new FormData(form).entries());
  const type = getSelectedType();
  const questionAnswers = getQuestionAnswers();
  return {
    ...data,
    mode: document.body.dataset.mode || "guided",
    caseTypeId: type.id,
    caseTypeName: type.name,
    easyCaseTitle: easyCaseCopy[type.id]?.[0] || type.name,
    lawKeywords: type.lawKeywords || [],
    questions: type.questions || [],
    questionAnswers,
    checkedQuestions: questionAnswers.filter((item) => item.answer).map((item) => item.question),
    evidenceTypes: getSelectedEvidenceTypes(),
    evidenceCards: getEvidenceCards(),
  };
};

buildComplaintDraft = function (data, ai = {}) {
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const evidenceList = buildEvidenceList(data);
  const facts = generateCrimeFacts(data);
  const accusedClue = compactText([data.accusedContact, data.accusedAddress, data.accusedClue], " / ");

  return [
    "[고소장]",
    "",
    "1. 고소인",
    `성명: ${valueOr(data.complainant, "[고소인 성명]")}`,
    `주소: ${valueOr(data.complainantAddress, "[고소인 주소]")}`,
    `연락처: ${valueOr(data.complainantPhone, "[고소인 연락처]")}`,
    "",
    "2. 피고소인",
    `성명: ${valueOr(data.accused, "성명불상자")}`,
    `주소: ${valueOr(data.accusedAddress, "추후 확인 필요")}`,
    `연락처 또는 특정 단서: ${valueOr(accusedClue, "추후 확인 필요")}`,
    `고소인과의 관계: ${valueOr(data.relationship, "추후 확인 필요")}`,
    "",
    "3. 고소취지",
    ai.purpose || buildPurpose(data),
    "",
    "4. 범죄사실",
    facts,
    "",
    "5. 고소이유",
    ai.reason || buildReasonSection(data, evidenceList),
    "",
    "6. 증거자료",
    ai.evidence || formatEvidenceList(evidenceList),
    "",
    "7. 참고사항",
    valueOr(data.relatedCase, "관련 신고, 고소, 민사소송, 합의 또는 변제 여부는 추후 확인 필요"),
    "",
    "8. 첨부자료",
    buildAttachmentList(evidenceList.map((item) => item.title)),
    "",
    "9. 작성일",
    today,
    "",
    "10. 고소인",
    `성명: ${valueOr(data.complainant, "[고소인 성명]")}`,
    "서명 또는 날인: ____________________",
    "",
    "제출 전 확인사항",
    buildCautions(data, evidenceList),
    "",
    "안내: 이 문서는 입력한 내용을 고소장 초안 형식으로 정리한 것입니다. 실제 제출 전 사실관계, 증거자료, 관할 수사기관, 서명 또는 날인을 반드시 확인하세요.",
  ].join("\n");
};

normalizeFactSection = function (value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const required = ["가. 사건의 시작", "나. 피고소인의 구체적인 행위", "다. 고소인이 믿고 한 행동 또는 피해 발생 과정", "라. 피해 결과", "마. 증거자료와 확인 가능한 사실"];
  return required.every((title) => text.includes(title)) ? text : "";
};

buildPurpose = function (data) {
  if (data.caseTypeId === "other") {
    return "고소인은 아래 피해 사실에 관하여 피고소인을 수사하여 처벌하여 주시기 바랍니다.";
  }
  return `고소인은 피고소인을 ${valueOr(data.caseTypeName, "관련 범죄")} 혐의 등으로 고소하오니, 아래 사실을 수사하여 처벌하여 주시기 바랍니다.`;
};

buildFactSection = function (data, evidenceList) {
  return [
    "가. 사건의 시작",
    buildStartParagraph(data),
    "",
    "나. 피고소인의 구체적인 행위",
    buildActionParagraph(data),
    "",
    "다. 고소인이 믿고 한 행동 또는 피해 발생 과정",
    buildProcessParagraph(data),
    "",
    "라. 피해 결과",
    buildDamageParagraph(data),
    "",
    "마. 증거자료와 확인 가능한 사실",
    buildEvidenceConnection(data, evidenceList),
  ].join("\n");
};

function buildStartParagraph(data) {
  const relation = valueOr(data.relationship, "추후 확인 필요");
  const timePlace = buildTimePlaceSentence(data);
  const accusedLine = buildAccusedSpecificLine(data);
  return `${accusedLine}\n고소인과 피고소인의 관계는 ${relation}입니다. ${timePlace}`;
}

function buildProcessParagraph(data) {
  const byType = {
    fraud: "고소인은 위와 같은 말이나 자료를 믿고 돈, 물건 또는 재산상 이익을 제공하였거나 제공하려 하였으며, 이후 약속이 이행되지 않아 피해가 발생하였습니다.",
    embezzlement: "고소인은 피고소인에게 돈이나 물건을 맡기거나 관리하게 하였으나, 피고소인이 반환 또는 정산을 하지 않아 피해가 발생하였습니다.",
    defamation: "문제된 말이나 게시물로 고소인의 신원이 특정될 수 있고, 이를 본 사람들에게 고소인의 사회적 평가가 낮아질 수 있는 피해가 발생하였습니다.",
    insult: "문제된 욕설이나 모욕적 표현으로 고소인은 정신적 고통을 겪었고, 그 표현이 전달된 상황과 범위는 수사 과정에서 확인이 필요합니다.",
    assault: "피고소인의 신체 접촉 또는 폭력적 행위로 고소인에게 신체적 고통과 피해가 발생하였습니다.",
    injury: "피고소인의 행위로 고소인에게 상처나 치료가 필요한 피해가 발생하였습니다.",
    stalking: "고소인은 피고소인의 반복적인 연락, 접근 또는 감시 등으로 불안감과 생활상 피해를 겪었습니다.",
    business: "피고소인의 행위로 고소인의 정상적인 영업 또는 업무 진행이 방해되었습니다.",
    cyber: "온라인 사이트, 앱, 계정 또는 결제 과정에서 고소인에게 피해가 발생하였습니다.",
  };
  return byType[data.caseTypeId] || "고소인은 위 행위로 인해 형사상 피해를 입었다고 보아 이 고소장을 제출합니다.";
}

function buildTimePlaceSentence(data) {
  const date = normalizeUnknown(data.incidentDate);
  const place = normalizeUnknown(data.incidentPlace);
  if (date !== "추후 확인 필요" && place !== "추후 확인 필요") return `사건은 ${date} ${place}에서 발생하였습니다.`;
  if (date !== "추후 확인 필요") return `사건은 ${date} 발생하였고, 장소는 추후 확인 필요합니다.`;
  if (place !== "추후 확인 필요") return `사건은 정확한 일시는 추후 확인 필요하나 ${place}에서 발생하였습니다.`;
  return "사건 일시와 장소는 현재 자료만으로 특정하기 어려우며, 추후 확인 필요합니다.";
};

buildAccusedSpecificLine = function (data) {
  const name = valueOr(data.accused, "성명불상자");
  const clues = compactText([data.accusedContact, data.accusedAddress, data.accusedClue], ", ");
  const base = clues ? `피고소인은 ${name}이며, 현재 확인 가능한 단서는 ${clues}입니다.` : `피고소인은 ${name}이며, 구체적인 인적사항은 추후 확인 필요합니다.`;
  if (/성명불상|불상|미상|모름/u.test(name)) return `${base} 대화내역, 계좌정보, 계정명, 전화번호, CCTV, 플랫폼 기록 등으로 피고소인을 특정할 필요가 있습니다.`;
  return base;
};

buildActionParagraph = function (data) {
  const story = String(data.story || "").trim();
  const answers = formatQuestionAnswers(data);
  const lines = [story, answers].filter(Boolean);
  return lines.length ? lines.join("\n") : "피고소인이 실제로 한 말이나 행동은 추후 확인 필요합니다.";
};

buildDamageParagraph = function (data) {
  const damage = compactText([data.damage, data.damageDetail], " / ");
  return damage ? `그 결과 고소인은 ${damage}의 피해를 입었습니다.` : "피해금액, 치료기간, 수리비, 영업손실 등 구체적인 피해 내용은 추후 확인 필요합니다.";
};

buildEvidenceConnection = function (data, evidenceList) {
  if (!evidenceList.length) return "현재 제출 예정 증거자료는 기재되지 않았습니다. 범죄사실을 뒷받침할 자료는 추후 확인 필요합니다.";
  return evidenceList.map((item, index) => {
    const date = item.date ? `, 증거 날짜는 ${item.date}` : "";
    const file = item.fileName ? `, 보관 위치 또는 파일명은 ${item.fileName}` : "";
    return `${index + 1}. ${item.title}${date}${file}: ${valueOr(item.description, "사건 관련 자료")}입니다. 이 자료로 확인하려는 내용은 ${valueOr(item.proves, "피고소인의 행위, 피해 발생 경위 또는 피해 결과")}입니다.`;
  }).join("\n");
};

getQuestionAnswers = function () {
  return [...questions.querySelectorAll("textarea[data-question]")].map((textarea, index) => ({
    index,
    question: textarea.dataset.question || "",
    answer: textarea.value.trim(),
    status: textarea.dataset.status || "",
  }));
};

formatQuestionAnswers = function (data) {
  const answers = getQuestionAnswersFromPayload(data).filter((item) => item.answer && item.answer !== "해당 없음");
  if (!answers.length) return "";
  return ["추가로 확인된 내용은 다음과 같습니다.", ...answers.map((item, index) => `${index + 1}) ${trimQuestion(item.question)}: ${item.answer}`)].join("\n");
};

trimQuestion = function (value) {
  return String(value || "").replace(/[?？.。]\s*$/u, "").trim();
};

buildEvidenceList = function (data) {
  const cardItems = Array.isArray(data.evidenceCards) ? data.evidenceCards.filter((item) => item.title || item.description || item.proves || item.fileName) : [];
  if (cardItems.length) {
    return cardItems.map((item, index) => ({
      title: item.title || `증거자료 ${index + 1}`,
      date: item.date || "",
      description: item.description || "",
      proves: item.proves || inferEvidenceProves(data.caseTypeId, item.title || "", item.description || ""),
      step: item.step || "",
      fileName: item.fileName || "",
    }));
  }
  const titles = splitEvidence(data.evidence || (Array.isArray(data.evidenceTypes) ? data.evidenceTypes.join(", ") : ""));
  const descriptions = String(data.evidenceDescription || "").split(/\n|;/u).map((item) => item.trim()).filter(Boolean);
  if (!titles.length && !descriptions.length) return [];
  const length = Math.max(titles.length, descriptions.length);
  return Array.from({ length }, (_, index) => ({
    title: titles[index] || `증거자료 ${index + 1}`,
    date: "",
    description: descriptions[index] || descriptions[0] || "",
    proves: inferEvidenceProves(data.caseTypeId, titles[index] || "", descriptions[index] || ""),
    fileName: "",
  }));
};

var formatEvidenceList = function (evidenceList) {
  if (!evidenceList.length) return "1) 증거명: 추후 확인 필요\n   입증하려는 사실: 피고소인의 행위, 피해 발생, 피해 결과를 보여주는 자료를 정리해야 합니다.";
  return evidenceList.map((item, index) => [
    `${index + 1}) 증거명: ${item.title}`,
    `   증거 날짜: ${valueOr(item.date, "추후 확인 필요")}`,
    `   증거 설명: ${valueOr(item.description, "추후 확인 필요")}`,
    `   입증하려는 사실: ${valueOr(item.proves, "추후 확인 필요")}`,
    item.fileName ? `   파일명 또는 보관 위치: ${item.fileName}` : "",
  ].filter(Boolean).join("\n")).join("\n");
};

inferEvidenceProves = function (caseTypeId, title, description) {
  const text = `${title} ${description}`;
  if (/송금|계좌|이체|입금|결제/u.test(text)) return "돈을 보낸 사실, 피해금액, 상대방 계좌 정보";
  if (/카카오|문자|대화|메시지|녹취|통화/u.test(text)) return "상대방이 한 말, 약속, 요구, 협박 또는 거부 의사 표시";
  if (/캡처|URL|게시|댓글|화면/u.test(text)) return "게시 위치, 표현 원문, 온라인 피해 경로";
  if (/진단|병원|치료|상처/u.test(text)) return "상처, 치료 기간, 병원 진료 내용";
  if (/CCTV|블랙박스|목격/u.test(text)) return "현장 상황과 상대방의 행위";
  const byType = {
    fraud: "상대방의 약속, 돈을 보낸 사실, 약속 미이행",
    defamation: "문제된 글의 원문, 게시 위치, 누가 볼 수 있었는지",
    insult: "욕설 원문, 말한 장소, 들은 사람",
    assault: "폭행 방법, 피해 부위, 현장 상황",
    stalking: "반복 연락, 거부 의사, 불안감",
  };
  return byType[caseTypeId] || "사건 내용과 피해 결과";
};

buildHelpfulChecklist = function (data) {
  const score = calculateCompletionScore(data);
  const missing = findMissingInfo(data);
  const items = [`고소장 완성도 ${score.score}점 - ${score.label}`];
  items.push(...score.messages);
  items.push(...missing.map((item) => item.startsWith("현재 ") ? item : `보완 필요: ${item}`));
  const answered = getQuestionAnswersFromPayload(data).filter((item) => item.answer && item.answer !== "해당 없음").length;
  items.push(answered ? `추가 질문 답변 ${answered}개가 범죄사실에 반영됩니다.` : "추가 질문 답변이 비어 있습니다. 아는 내용만 적으면 범죄사실이 더 구체화됩니다.");
  return [...new Set(items)];
};

var checkMissingFields = function (data) {
  const missing = [];
  const evidenceList = buildEvidenceList(data);
  const accusedKnown = [data.accused, data.accusedContact, data.accusedAddress, data.accusedClue].some((value) => String(value || "").trim());
  [
    [data.complainant, "고소인 이름을 입력하세요."],
    [data.complainantPhone, "고소인 연락처를 입력하세요."],
    [accusedKnown, "상대방 이름, 연락처, 계정, 계좌번호 등 아는 정보를 하나 이상 입력하세요."],
    [data.incidentDate, "사건 날짜를 입력하세요. 정확히 모르면 대략적인 날짜라도 적으세요."],
    [data.incidentPlace, "사건 장소나 플랫폼을 입력하세요."],
    [data.story, "피해사실을 적으세요. 상대방이 실제로 한 말이나 행동과 그 결과를 적으면 됩니다."],
    [data.damage || data.damageDetail, "피해금액, 치료기간, 수리비, 영업손실 등 피해 내용을 적으세요."],
    [evidenceList.length, "증거자료를 하나 이상 정리하세요."],
    [evidenceList.some((item) => item.proves || item.description), "증거가 무엇을 보여주는지 적으세요."],
  ].forEach(([value, label]) => {
    if (!value || !String(value).trim()) missing.push(label);
  });
  missing.push(...typeSpecificMissing(data));
  return [...new Set(missing)];
};

function calculateCompletionScore(data) {
  const evidenceList = buildEvidenceList(data);
  const checks = [
    [[data.accused, data.accusedContact, data.accusedAddress, data.accusedClue].some((value) => String(value || "").trim()), "상대방을 특정할 단서가 필요합니다."],
    [data.incidentDate, "사건 날짜가 필요합니다."],
    [data.incidentPlace, "사건 장소나 플랫폼이 필요합니다."],
    [data.story, "피해사실 작성이 필요합니다."],
    [data.damage || data.damageDetail, "피해 내용이 필요합니다."],
    [evidenceList.length, "증거자료가 필요합니다."],
    [evidenceList.some((item) => item.proves || item.description), "증거와 사건 내용의 연결이 필요합니다."],
  ];
  const passed = checks.filter(([value]) => Boolean(value && String(value).trim())).length;
  const score = Math.round((passed / checks.length) * 100);
  const label = score >= 80 ? "비교적 충분" : score >= 60 ? "일부 보완 필요" : "핵심 내용 부족";
  const messages = checks.filter(([value]) => !Boolean(value && String(value).trim())).map(([, message]) => message);
  return { score, label, messages };
}

typeSpecificMissing = function (data) {
  const cardText = Array.isArray(data.evidenceCards) ? data.evidenceCards.map((item) => Object.values(item || {}).join(" ")).join(" ") : "";
  const text = [data.story, data.damage, data.damageDetail, data.evidence, data.evidenceDescription, cardText, ...getQuestionAnswersFromPayload(data).map((item) => `${item.question} ${item.answer}`)].join(" ");
  const groups = {
    fraud: [["약속|설명|판매|투자|환불|배송", "사기: 상대방이 어떤 약속이나 설명을 했는지 더 적으면 좋습니다."], ["송금|이체|입금|결제|계좌|원|만원", "사기: 돈을 보낸 날짜, 금액, 방법을 더 적으면 좋습니다."], ["대화|캡처|계좌|판매글|계약|녹취", "사기: 약속 내용과 돈을 보낸 사실을 보여줄 증거를 적으면 좋습니다."]],
    defamation: [["원문|게시|댓글|단체방|URL|캡처", "명예훼손: 문제된 글의 원문과 게시 위치를 적으면 좋습니다."], ["누가|사람|공개|단체방|조회|댓글", "명예훼손: 그 글을 볼 수 있었던 사람을 적으면 좋습니다."], ["내|고소인|실명|사진|계정|별명", "명예훼손: 그 글이 고소인에 대한 것이라고 알 수 있는 이유를 적으면 좋습니다."]],
    insult: [["욕|말|원문|모욕|비하", "모욕: 상대방이 한 말을 그대로 적으면 좋습니다."], ["누가|사람|단체방|공개|앞에서", "모욕: 그 말을 들은 사람이나 볼 수 있었던 사람을 적으면 좋습니다."]],
    assault: [["때리|밀|잡|차|폭행|부위|얼굴|팔|다리", "폭행: 어떤 방식으로 맞거나 밀렸는지와 피해 부위를 적으면 좋습니다."], ["CCTV|목격|사진|신고|112|영상", "폭행: 현장 증거 또는 신고 여부를 적으면 좋습니다."]],
    injury: [["진단|치료|병원|상처|전치|골절|영수증", "상해: 병원명, 진단명, 치료 기간, 진단서 여부를 적으면 좋습니다."]],
    embezzlement: [["맡|보관|관리|정산|반환|돌려", "횡령: 돈이나 물건을 맡기게 된 이유와 돌려받기로 한 내용을 적으면 좋습니다."], ["사용|거부|연락두절|반환", "횡령: 상대방이 돌려주지 않거나 마음대로 사용한 정황을 적으면 좋습니다."]],
    stalking: [["반복|횟수|전화|문자|접근|기다|감시|방문", "스토킹: 반복된 연락이나 방문의 날짜와 횟수를 적으면 좋습니다."], ["그만|거부|연락하지|싫다", "스토킹: 그만하라고 말한 내용이 있으면 적으면 좋습니다."], ["불안|공포|두려|생활|무섭", "스토킹: 불안감이나 생활상 피해를 적으면 좋습니다."]],
    business: [["업무|영업|가게|손님|매출|예약", "업무방해: 어떤 업무가 어떻게 방해됐는지 적으면 좋습니다."]],
    cyber: [["URL|사이트|앱|계정|닉네임|이메일|전화", "사이버범죄: 사이트, 앱, URL, 계정명 등 단서를 적으면 좋습니다."]],
  };
  return (groups[data.caseTypeId] || []).filter(([pattern]) => !new RegExp(pattern, "u").test(text)).map(([, message]) => message);
};

function setupEasyFlowControls() {
  document.querySelector("#guidedModeBtn")?.addEventListener("click", () => {
    document.body.dataset.mode = "guided";
    document.querySelector("#caseTypeGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#freeModeBtn")?.addEventListener("click", () => {
    document.body.dataset.mode = "free";
    form.elements.story?.focus();
  });
  renderEvidenceTypes();
  if (!document.querySelector(".evidence-card")) addEvidenceCard();
  document.querySelector("#addEvidenceBtn")?.addEventListener("click", () => {
    addEvidenceCard();
    syncDraftFromInputs();
    autoSave();
  });
  form.addEventListener("input", updateEventSummary);
  form.addEventListener("change", updateEventSummary);
  updateEventSummary();
}

function renderEvidenceTypes() {
  const container = document.querySelector("#evidenceTypeGrid");
  if (!container) return;
  container.innerHTML = evidenceTypeOptions.map((type) => `<label class="evidence-chip"><input type="checkbox" value="${escapeHtml(type)}" />${escapeHtml(type)}</label>`).join("");
  container.addEventListener("change", () => {
    syncEvidenceTextFields();
    syncDraftFromInputs();
    autoSave();
  });
}

function addEvidenceCard(data = {}) {
  const list = document.querySelector("#evidenceCardList");
  if (!list) return;
  const card = document.createElement("section");
  card.className = "evidence-card";
  card.innerHTML = `
    <div class="evidence-card-header"><strong>증거자료</strong><button class="ghost-button mini-button" type="button">삭제</button></div>
    <div class="evidence-card-grid">
      <label>증거 종류<input data-evidence-field="title" value="${escapeHtml(data.title || "")}" placeholder="예: 카카오톡 대화" /></label>
      <label>증거 날짜<input data-evidence-field="date" value="${escapeHtml(data.date || "")}" placeholder="예: 2026년 6월 20일" /></label>
      <label>관련 사건 단계<input data-evidence-field="step" value="${escapeHtml(data.step || "")}" placeholder="예: 송금 전 약속 / 폭행 직후" /></label>
      <label>파일명 또는 보관 위치<input data-evidence-field="fileName" value="${escapeHtml(data.fileName || "")}" placeholder="예: KakaoTalk_20260620.png" /></label>
      <label>증거 설명<textarea data-evidence-field="description" rows="2" placeholder="이 증거가 어떤 자료인지 적어주세요.">${escapeHtml(data.description || "")}</textarea></label>
      <label>이 증거로 보여주고 싶은 내용<textarea data-evidence-field="proves" rows="2" placeholder="예: 상대방이 50만원을 받았고 물건을 보내겠다고 한 사실">${escapeHtml(data.proves || "")}</textarea></label>
    </div>`;
  card.querySelector("button")?.addEventListener("click", () => {
    card.remove();
    syncDraftFromInputs();
    autoSave();
  });
  card.addEventListener("input", () => {
    syncEvidenceTextFields();
    autoResizeTextareas();
  });
  list.append(card);
}

function getSelectedEvidenceTypes() {
  return [...document.querySelectorAll("#evidenceTypeGrid input:checked")].map((input) => input.value);
}

function getEvidenceCards() {
  return [...document.querySelectorAll(".evidence-card")].map((card) => {
    const item = {};
    card.querySelectorAll("[data-evidence-field]").forEach((field) => {
      item[field.dataset.evidenceField] = field.value.trim();
    });
    return item;
  });
}

function syncEvidenceTextFields() {
  if (!form?.elements) return;
  const cards = getEvidenceCards();
  const types = getSelectedEvidenceTypes();
  const titles = [...types, ...cards.map((item) => item.title).filter(Boolean)];
  const descriptions = cards.map((item) => [item.description, item.proves].filter(Boolean).join(" - ")).filter(Boolean);
  if (titles.length && form.elements.evidence) form.elements.evidence.value = [...new Set(titles)].join(", ");
  if (descriptions.length && form.elements.evidenceDescription) form.elements.evidenceDescription.value = descriptions.join("\n");
}

function updateEventSummary() {
  const panel = document.querySelector("#eventSummaryPanel");
  if (!panel || !form) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const summary = extractEventInfo(data);
  panel.hidden = false;
  panel.innerHTML = `
    <h3>입력하신 내용을 이렇게 이해했어요. 맞는지 확인해주세요.</h3>
    <dl>
      <dt>상대방</dt><dd>${escapeHtml(summary.accused)}</dd>
      <dt>사건일</dt><dd>${escapeHtml(summary.date)}</dd>
      <dt>장소</dt><dd>${escapeHtml(summary.place)}</dd>
      <dt>주요 내용</dt><dd>${escapeHtml(summary.main)}</dd>
      <dt>피해</dt><dd>${escapeHtml(summary.damage)}</dd>
      <dt>증거</dt><dd>${escapeHtml(summary.evidence)}</dd>
      <dt>더 확인할 내용</dt><dd>${escapeHtml(summary.missing)}</dd>
    </dl>`;
}

function extractEventInfo(data) {
  const missing = [];
  if (!data.accused && !data.accusedContact && !data.accusedClue) missing.push("상대방 단서");
  if (!data.incidentDate) missing.push("사건일");
  if (!data.incidentPlace) missing.push("장소");
  if (!data.damage && !data.damageDetail) missing.push("피해");
  if (!data.evidence && !data.evidenceDescription) missing.push("증거");
  return {
    accused: compactText([data.accused, data.accusedContact, data.accusedClue], " / ") || "추후 확인 필요",
    date: data.incidentDate || "추후 확인 필요",
    place: data.incidentPlace || "추후 확인 필요",
    main: String(data.story || "추후 확인 필요").slice(0, 120),
    damage: compactText([data.damage, data.damageDetail], " / ") || "추후 확인 필요",
    evidence: compactText([data.evidence, data.evidenceDescription], " / ") || "추후 확인 필요",
    missing: missing.length ? missing.join(", ") : "현재 핵심 내용은 입력되어 있습니다.",
  };
}

setFormValues = function (data) {
  for (const element of form.elements) {
    if (!element.name || data[element.name] === undefined) continue;
    element.value = data[element.name];
  }
  if (Array.isArray(data.evidenceCards)) {
    const list = document.querySelector("#evidenceCardList");
    if (list) {
      list.innerHTML = "";
      data.evidenceCards.forEach((item) => addEvidenceCard(item));
    }
  }
};

const wizardState = { current: 1, total: 8, ready: false };

function setupWizardUx() {
  setupMobileMenu();
  setupFreeMode();
  setupFieldHelpers();
  createWizardCards();
  setupWizardButtons();
  editor.placeholder = "아직 고소장 초안이 없습니다.\n\n위 단계에서 사건 내용을 입력하면 이곳에 초안이 표시됩니다.";
  if (!hasMeaningfulInput()) {
    editor.value = "";
    statusText.textContent = "아직 고소장 초안이 없습니다. 작성 단계에서 사건 내용을 입력해 주세요.";
  }
  wizardState.ready = true;
  showWizardStep(1);
  updateCompletionPreview();
}

function setupMobileMenu() {
  const toggle = document.querySelector("#mobileMenuToggle");
  const menu = document.querySelector("#topMenu");
  if (!toggle || !menu) return;
  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

function setupFreeMode() {
  const panel = document.querySelector("#freeModePanel");
  const freeInput = document.querySelector("#freeTextInput");
  document.querySelector("#freeModeBtn")?.addEventListener("click", () => {
    document.body.dataset.mode = "free";
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    freeInput?.focus();
  });
  document.querySelector("#organizeFreeTextBtn")?.addEventListener("click", () => {
    const text = String(freeInput?.value || "").trim();
    if (!text) return;
    form.elements.story.value = text;
    document.body.dataset.mode = "free";
    updateEventSummary();
    syncDraftFromInputs();
    autoSave();
    showWizardStep(4);
  });
}

function setupFieldHelpers() {
  const helpText = {
    complainant: "실제 제출 전 주민등록번호와 서명은 직접 확인하세요.",
    complainantPhone: "수사기관에서 연락할 수 있는 번호를 적어주세요.",
    complainantAddress: "정확한 주소를 모르면 시·군·구 정도라도 적어두세요.",
    accused: "이름을 모르면 성명불상이라고 적어도 됩니다.",
    accusedContact: "전화번호, 카카오톡 ID, 이메일, SNS 계정도 도움이 됩니다.",
    relationship: "예: 중고거래 상대, 전 직장동료, 전 연인, 모르는 사람",
    accusedAddress: "주소, 직장, 차량번호처럼 상대방을 찾는 데 도움이 되는 내용을 적어주세요.",
    accusedClue: "계좌번호, 닉네임, 프로필 링크처럼 작은 단서도 괜찮습니다.",
    incidentDateInput: "정확한 날짜를 모르면 피해사실에 '2026년 6월 초순경'처럼 적어도 됩니다.",
    incidentPlace: "온라인 사건이면 앱 이름, 단체방 이름, URL을 적어주세요.",
    story: "피해사실을 시간순으로 적으면 좋습니다. 누가, 언제, 어디서, 무엇을 했고 어떤 피해가 생겼는지만 적어도 됩니다.",
    damage: "돈, 치료기간, 수리비, 영업손실처럼 확인 가능한 피해를 적어주세요.",
    damageDetail: "피해가 생활에 어떤 영향을 줬는지도 적으면 도움이 됩니다.",
    evidence: "증거 종류는 위 버튼이나 증거 카드로 정리할 수 있습니다.",
    evidenceDescription: "파일명보다 '무엇을 보여주는지'가 더 중요합니다.",
    relatedCase: "이미 신고했거나 민사소송이 있으면 적어주세요. 없으면 해당 없음으로 표시해도 됩니다.",
    punishmentIntent: "처벌을 원한다는 뜻을 간단히 적으면 됩니다.",
  };

  [...form.querySelectorAll("label")].forEach((label) => {
    const field = label.querySelector("input[name], textarea[name]");
    if (!field || label.dataset.enhanced === "true") return;
    label.dataset.enhanced = "true";
    if (["evidence", "evidenceDescription"].includes(field.name)) label.classList.add("legacy-evidence-field");
    const help = document.createElement("small");
    help.className = "field-help";
    help.textContent = helpText[field.name] || "아는 만큼만 적어주세요.";
    const actions = document.createElement("div");
    actions.className = "field-quick-actions";
    [
      ["잘 모르겠어요", "추후 확인 필요"],
      ["나중에 입력할게요", ""],
      ["해당 없어요", "해당 없음"],
    ].forEach(([text, value]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.addEventListener("click", () => {
        field.value = value;
        field.dataset.status = text;
        autoResizeTextareas(field);
        updateEventSummary();
        syncDraftFromInputs();
        autoSave();
      });
      actions.append(button);
    });
    label.append(help, actions);
  });
}

function createWizardCards() {
  if (document.querySelector(".wizard-step")) return;
  const inputPane = document.querySelector(".input-pane");
  const formChildren = [...form.children];
  const dividers = formChildren.filter((child) => child.classList?.contains("step-divider"));
  wrapLooseStep(1, findStepRow("어떤 피해"), [findStepRow("어떤 피해"), document.querySelector("#caseTypeGrid")?.previousElementSibling, grid].filter(Boolean));
  wrapFormStep(2, findStepRow("상대방"), formChildren.slice(0, formChildren.indexOf(dividers[0])));
  wrapFormStep(3, dividers[0], formChildren.slice(formChildren.indexOf(dividers[0]), formChildren.indexOf(dividers[1])));
  wrapFormStep(4, dividers[1], formChildren.slice(formChildren.indexOf(dividers[1]), formChildren.indexOf(dividers[2])));
  wrapFormStep(5, dividers[2], formChildren.slice(formChildren.indexOf(dividers[2]), formChildren.indexOf(dividers[3])));
  wrapFormStep(6, dividers[3], formChildren.slice(formChildren.indexOf(dividers[3])));

  const row7 = findStepRow("빠진");
  const row8 = findStepRow("고소장 초안");
  const step7Items = [];
  let cursor = row7;
  while (cursor && cursor !== row8) {
    const next = cursor.nextElementSibling;
    step7Items.push(cursor);
    cursor = next;
  }
  const completion = document.createElement("div");
  completion.id = "completionPreview";
  completion.className = "completion-preview";
  step7Items.push(completion);
  wrapLooseStep(7, row7, step7Items);

  const nav = document.querySelector("#wizardNav");
  const step8Items = [];
  cursor = row8;
  while (cursor && cursor !== nav) {
    const next = cursor.nextElementSibling;
    step8Items.push(cursor);
    cursor = next;
  }
  wrapLooseStep(8, row8, step8Items);
  inputPane.classList.add("wizard-ready");
}

function wrapLooseStep(step, anchor, items) {
  if (!anchor || !items.length) return;
  const card = document.createElement("section");
  card.className = "wizard-step";
  card.dataset.step = String(step);
  anchor.parentElement.insertBefore(card, anchor);
  items.forEach((item) => card.append(item));
  appendStepFooter(card);
}

function wrapFormStep(step, anchor, items) {
  if (!anchor || !items.length) return;
  const card = document.createElement("section");
  card.className = "wizard-step";
  card.dataset.step = String(step);
  form.insertBefore(card, items[0]);
  items.forEach((item) => card.append(item));
  appendStepFooter(card);
}

function appendStepFooter(card) {
  const footer = document.createElement("div");
  footer.className = "step-card-footer";
  footer.innerHTML = '<button class="ghost-button step-prev" type="button">이전</button><button class="secondary-button step-save" type="button">임시저장</button><button class="primary-button step-next" type="button">다음</button>';
  card.append(footer);
  footer.querySelector(".step-prev").addEventListener("click", () => showWizardStep(wizardState.current - 1));
  footer.querySelector(".step-save").addEventListener("click", () => {
    autoSave();
    saveDraft();
    updateWizardSaveText("방금 저장됨");
  });
  footer.querySelector(".step-next").addEventListener("click", () => {
    if (wizardState.current >= wizardState.total) generateDraft();
    else showWizardStep(wizardState.current + 1);
  });
}

function setupWizardButtons() {
  document.querySelector("#prevStepBtn")?.addEventListener("click", () => showWizardStep(wizardState.current - 1));
  document.querySelector("#nextStepBtn")?.addEventListener("click", () => {
    if (wizardState.current >= wizardState.total) generateDraft();
    else showWizardStep(wizardState.current + 1);
  });
  document.querySelector("#tempSaveBtn")?.addEventListener("click", () => {
    autoSave();
    saveDraft();
    updateWizardSaveText("방금 저장됨");
  });
  document.querySelector("#guidedModeBtn")?.addEventListener("click", () => showWizardStep(1));
}

function showWizardStep(step) {
  wizardState.current = Math.min(Math.max(step, 1), wizardState.total);
  document.querySelectorAll(".wizard-step").forEach((card) => {
    const active = Number(card.dataset.step) === wizardState.current;
    card.hidden = !active;
    card.classList.toggle("is-active", active);
  });
  updateWizardProgress();
  updateCompletionPreview();
  if (wizardState.ready) scrollWizardToStepTop();
}

function scrollWizardToStepTop() {
  const activeCard = document.querySelector(`.wizard-step[data-step="${wizardState.current}"]`);
  const progress = document.querySelector("#wizardProgress");
  const header = document.querySelector(".app-header");
  if (!activeCard || !progress) return;
  const headerHeight = header?.getBoundingClientRect().height || 0;
  const progressHeight = progress.getBoundingClientRect().height || 0;
  const gap = window.matchMedia("(max-width: 640px)").matches ? 12 : 16;
  requestAnimationFrame(() => {
    const activeTop = activeCard.getBoundingClientRect().top + window.scrollY;
    const top = activeTop - headerHeight - progressHeight - gap;
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  });
}

function updateWizardProgress() {
  const percent = Math.round((wizardState.current / wizardState.total) * 100);
  const text = document.querySelector("#wizardProgressText");
  const bar = document.querySelector("#wizardProgressBar");
  const prev = document.querySelector("#prevStepBtn");
  const next = document.querySelector("#nextStepBtn");
  if (text) text.textContent = `${wizardState.current} / ${wizardState.total} 단계 작성 중`;
  if (bar) bar.style.width = `${percent}%`;
  if (prev) prev.disabled = wizardState.current <= 1;
  if (next) next.textContent = getWizardNextLabel();
  document.querySelectorAll(".step-next").forEach((button) => {
    button.textContent = getWizardNextLabel();
  });
}

function getWizardNextLabel() {
  const labels = {
    1: "다음: 기본정보",
    2: "다음: 일시/장소",
    3: "다음: 피해사실",
    4: "다음: 피해내용",
    5: "다음: 증거",
    6: "다음: 보완확인",
    7: "다음: 초안",
  };
  return wizardState.current >= wizardState.total ? "초안 만들기" : labels[wizardState.current] || "다음";
}

function updateWizardSaveText(text = "자동 저장됨") {
  const target = document.querySelector("#wizardSaveText");
  if (target) target.textContent = text;
}

function updateCompletionPreview() {
  const target = document.querySelector("#completionPreview");
  if (!target) return;
  const data = getPayload();
  const score = calculateCompletionScore(data);
  const checks = getCompletionChecks(data);
  target.className = `completion-preview score-${score.score >= 80 ? "good" : score.score >= 60 ? "mid" : "low"}`;
  target.innerHTML = `
    <div class="completion-head">
      <div><strong>현재 초안 완성도: ${score.score}점</strong><p>${score.score >= 80 ? "제출 전 검토용 초안으로 사용할 수 있습니다." : "아래 내용을 보완하면 더 좋아요."}</p></div>
      <div class="completion-ring" style="--score:${score.score}">${score.score}</div>
    </div>
    <div class="completion-bar"><span style="width:${score.score}%"></span></div>
    <div class="completion-checks">${checks.map((item) => `<div class="completion-check ${item.ok ? "ok" : "warn"}"><strong>${item.ok ? "입력됨" : "보완하면 좋아요"}</strong><span>${escapeHtml(item.text)}</span></div>`).join("")}</div>`;
}

function getCompletionChecks(data) {
  const evidenceList = buildEvidenceList(data);
  return [
    { ok: [data.accused, data.accusedContact, data.accusedAddress, data.accusedClue].some((value) => String(value || "").trim()), text: "상대방 이름, 연락처, 계좌번호, 아이디 같은 단서" },
    { ok: Boolean(data.incidentDate), text: "사건 날짜" },
    { ok: Boolean(data.incidentPlace), text: "사건 장소나 플랫폼" },
    { ok: Boolean(data.story), text: "피해사실과 상대방의 구체적인 행동" },
    { ok: Boolean(data.damage || data.damageDetail), text: "피해 내용" },
    { ok: Boolean(evidenceList.length), text: "증거자료" },
    { ok: evidenceList.some((item) => item.proves || item.description), text: "증거가 보여주는 내용" },
  ];
}

function findStepRow(text) {
  return [...document.querySelectorAll(".step-row")].find((row) => row.textContent.includes(text));
}

function hasMeaningfulInput() {
  const data = Object.fromEntries(new FormData(form).entries());
  return ["complainant", "accused", "incidentDate", "incidentPlace", "story", "damage", "evidence"].some((key) => String(data[key] || "").trim());
}

const originalSyncDraftFromInputs = syncDraftFromInputs;
syncDraftFromInputs = function () {
  originalSyncDraftFromInputs();
  updateEventSummary();
  updateCompletionPreview();
};

const originalAutoSave = autoSave;
autoSave = function () {
  originalAutoSave();
  updateWizardSaveText("자동 저장됨");
};

renderList = function (target, items) {
  target.innerHTML = "";
  for (const text of items.length ? items : ["입력한 내용을 바탕으로 보완할 부분을 알려드릴게요."]) {
    const li = document.createElement("li");
    const value = typeof text === "string" ? text : text.label;
    li.className = value.includes("완성도") ? "score-list-item" : value.includes("필요") || value.includes("보완") ? "soft-warning" : "soft-ok";
    li.textContent = value;
    target.append(li);
  }
};

init().then(() => {
  setupEasyFlowControls();
  setupWizardUx();
});
