const consistencyForm = document.querySelector("#complaintForm");
const consistencyEditor = document.querySelector("#draftEditor");
const consistencyGrid = document.querySelector("#caseTypeGrid");

let consistencyApplying = false;
let consistencyLastSnapshot = "";

if (consistencyForm && consistencyEditor) {
  window.addEventListener("load", scheduleConsistencyPatch);
  consistencyForm.addEventListener("input", scheduleConsistencyPatch);
  consistencyForm.addEventListener("change", scheduleConsistencyPatch);
  consistencyGrid?.addEventListener("click", scheduleConsistencyPatch);
  document.querySelector("#generateBtn")?.addEventListener("click", () => {
    scheduleConsistencyPatch();
    setTimeout(scheduleConsistencyPatch, 800);
    setTimeout(scheduleConsistencyPatch, 1800);
    setTimeout(scheduleConsistencyPatch, 4000);
  });

  setInterval(() => {
    const snapshot = getConsistencySnapshot();
    if (snapshot !== consistencyLastSnapshot) patchDraftConsistency();
  }, 700);
}

function scheduleConsistencyPatch() {
  setTimeout(patchDraftConsistency, 0);
}

function patchDraftConsistency() {
  if (consistencyApplying || !consistencyEditor.value.trim()) return;
  consistencyApplying = true;

  const data = getConsistencyData();
  const originalDraft = consistencyEditor.value;
  let draft = originalDraft;

  draft = patchPersonName(draft, "1. 고소인*", data.complainant || "[고소인 성명]");
  draft = patchPersonDetail(draft, "1. 고소인*", "2. 피고소인*", "주민등록번호", "[제출 전 직접 기재]");
  draft = patchPersonDetail(draft, "1. 고소인*", "2. 피고소인*", "주소", data.complainantAddress || "[주소]");
  draft = patchPersonDetail(draft, "1. 고소인*", "2. 피고소인*", "전화", data.complainantPhone || "[연락처]");

  draft = patchPersonName(draft, "2. 피고소인*", data.accused || "[피고소인 성명 또는 성명불상]");
  draft = patchPersonDetail(draft, "2. 피고소인*", "3. 고소취지*", "주민등록번호", "[알고 있는 경우 제출 전 직접 기재]");
  draft = patchPersonDetail(draft, "2. 피고소인*", "3. 고소취지*", "주소", data.accusedAddress || "[주소 또는 알 수 없는 사유]");
  draft = patchPersonDetail(draft, "2. 피고소인*", "3. 고소취지*", "전화", data.accusedContact || "[연락처 또는 계정]");

  draft = patchPurpose(draft, data);
  draft = patchFacts(draft, data);
  draft = patchReason(draft, data);
  draft = patchEvidence(draft, data);
  draft = patchAttachmentList(draft, data);

  consistencyEditor.value = draft;
  consistencyLastSnapshot = getConsistencySnapshot();
  consistencyApplying = false;

  if (draft !== originalDraft) {
    consistencyEditor.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function getConsistencyData() {
  const formData = Object.fromEntries(new FormData(consistencyForm).entries());
  const selectedType = document.querySelector('.case-card[aria-pressed="true"] strong')?.textContent?.trim() || formData.caseTypeName || "관련 범죄";
  return {
    ...formData,
    caseTypeName: selectedType,
    incidentDate: formData.incidentDate || formatConsistencyDate(formData.incidentDateInput),
  };
}

function getConsistencySnapshot() {
  const data = getConsistencyData();
  return JSON.stringify({
    complainant: data.complainant || "",
    complainantPhone: data.complainantPhone || "",
    complainantAddress: data.complainantAddress || "",
    accused: data.accused || "",
    accusedContact: data.accusedContact || "",
    accusedAddress: data.accusedAddress || "",
    caseTypeName: data.caseTypeName || "",
    incidentDate: data.incidentDate || "",
    incidentPlace: data.incidentPlace || "",
    damage: data.damage || "",
    evidence: data.evidence || "",
    story: data.story || "",
    checkedQuestions: getCheckedQuestionsFromPage().join("|"),
    draft: consistencyEditor.value,
  });
}

function formatConsistencyDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  let text = `${year}년 ${Number(month)}월 ${Number(day)}일 ${Number(hour)}시`;
  if (minute !== "00") text += ` ${Number(minute)}분`;
  return `${text}경`;
}

function patchPersonName(draft, sectionTitle, name) {
  const escapedTitle = escapeRegExp(sectionTitle);
  const pattern = new RegExp(`(${escapedTitle}\\n)성명:.*`);
  if (!pattern.test(draft)) return draft;
  return draft.replace(pattern, (_match, prefix) => `${prefix}성명: ${name}`);
}

function patchPersonDetail(draft, sectionTitle, endTitle, label, value) {
  const start = draft.indexOf(sectionTitle);
  const end = draft.indexOf(endTitle, start + sectionTitle.length);
  if (start < 0 || end < 0) return draft;

  const section = draft.slice(start, end);
  const pattern = new RegExp(`(^${escapeRegExp(label)}:).*`, "m");
  if (!pattern.test(section)) return draft;

  const patched = section.replace(pattern, (_match, prefix) => `${prefix} ${value}`);
  return `${draft.slice(0, start)}${patched}${draft.slice(end)}`;
}

function patchPurpose(draft, data) {
  const purpose = `고소인은 피고소인을 ${data.caseTypeName || "관련 범죄"} 혐의로 고소하오니, 철저히 수사하여 법에 따라 처벌하여 주시기 바랍니다.`;
  return replaceSection(draft, "3. 고소취지*", "4. 범죄사실*", ["3. 고소취지*", purpose].join("\n"));
}

function patchFacts(draft, data) {
  const accusedName = data.accused || "[피고소인 성명 또는 성명불상]";
  const accusedDetails = [data.accusedContact && `연락처/계정: ${data.accusedContact}`, data.accusedAddress && `주소/단서: ${data.accusedAddress}`].filter(Boolean);
  const accusedLine = accusedDetails.length
    ? `피고소인은 ${accusedName}(${accusedDetails.join(", ")})입니다.`
    : `피고소인은 ${accusedName}입니다.`;
  const unknownLine = /성명불상|미상|모름|불상/u.test(accusedName)
    ? "현재 피고소인의 정확한 인적사항을 알 수 없으나, 위 연락처·계정·주소 단서와 피해 경위로 피고소인을 특정할 수 있습니다."
    : "";
  const conduct = String(data.story || "").trim() || "[피고소인이 한 말, 행동, 돈이나 물건을 받은 방법, 폭행·협박·게시글 등 구체적 행위를 시간순으로 기재]";
  const checkedQuestions = getCheckedQuestionsFromPage();
  const checkedLine = checkedQuestions.length ? checkedQuestions.join(", ") : "[해당되는 추가 질문을 체크하면 자동 반영]";

  const section = [
    "4. 범죄사실*",
    "가. 피고소인 특정",
    accusedLine,
    unknownLine,
    "",
    "나. 범행 일시와 장소",
    `피고소인은 ${data.incidentDate || "[일시 기재]"}, ${data.incidentPlace || "[장소 기재]"}에서 아래 행위를 하였습니다.`,
    "",
    "다. 범행 방법과 구체적 행위",
    conduct,
    "",
    "라. 피해 결과",
    `그 결과 고소인은 ${data.damage || "[피해금액 또는 피해내용 기재]"}의 피해를 입었습니다.`,
    "",
    "마. 범죄유형 및 보충 사정",
    `위 행위는 ${data.caseTypeName || "[범죄유형]"} 혐의와 관련된 사실로 정리됩니다.`,
    `추가 확인 항목: ${checkedLine}`,
  ].filter((line) => line !== "").join("\n");

  return replaceSection(draft, "4. 범죄사실*", "5. 고소이유", section);
}

function patchReason(draft, data) {
  const storyText = data.story ? "고소인은 위 범죄사실을 사실 중심으로 정리하여 제출하며, 수사기관의 사실관계 확인을 요청합니다." : "고소인은 사건 경위를 추가로 보완하여 제출할 예정입니다.";
  const reason = [
    "5. 고소이유",
    `위 범죄사실은 ${data.caseTypeName || "형사사건"} 혐의와 관련될 수 있습니다.`,
    data.damage ? `고소인은 이 사건으로 ${data.damage}의 피해를 입었습니다.` : "고소인은 이 사건으로 피해를 입었습니다.",
    storyText,
    "따라서 피고소인에 대한 사실관계를 확인하고 법에 따라 처리해 주시기 바랍니다.",
  ].join("\n");

  return replaceSection(draft, "5. 고소이유", "6. 증거자료", reason);
}

function patchEvidence(draft, data) {
  const evidenceItems = splitEvidence(data.evidence);
  const checkedLine = evidenceItems.length
    ? "☑ 고소인은 고소인의 진술 외에 제출할 증거가 있습니다."
    : "□ 고소인은 고소인의 진술 외에 제출할 증거가 없습니다.";
  const evidenceLine = `증거자료: ${evidenceItems.length ? evidenceItems.join(", ") : "[문자, 카카오톡, 계좌이체내역, 사진, 진단서, 녹취, CCTV 등]"}`;
  const section = ["6. 증거자료", checkedLine, evidenceLine].join("\n");
  return replaceSection(draft, "6. 증거자료", "7. 관련사건의 수사 및 재판 여부*", section);
}

function patchAttachmentList(draft, data) {
  const evidenceItems = splitEvidence(data.evidence);
  const documentRows = evidenceItems.length
    ? evidenceItems.map((item, index) => `${index + 1}) ${item} / 작성자 또는 보관자: [직접 기재] / 제출 유무: ☑ 접수시 제출 □ 수사 중 제출`)
    : ["1) [증거명] / 작성자 또는 보관자: [직접 기재] / 제출 유무: □ 접수시 제출 □ 수사 중 제출"];

  const section = [
    "[별지] 증거자료 세부 목록",
    "",
    "1. 인적증거 (목격자, 참고인 등)",
    "성명: [참고인 성명] / 연락처: [연락처] / 입증하려는 내용: [무엇을 증명하는지]",
    "",
    "2. 증거서류·사진·자료",
    ...documentRows,
    "",
    "3. 증거물",
    "1) [증거물] / 소유자: [소유자] / 제출 유무: □ 접수시 제출 □ 수사 중 제출",
    "",
    "4. 기타 증거",
    evidenceItems.length ? "위 목록 외 추가 증거가 있으면 직접 기재합니다." : "[그 밖의 증거가 있으면 기재]",
  ].join("\n");

  const start = draft.indexOf("[별지] 증거자료 세부 목록");
  if (start < 0) return draft;
  return `${draft.slice(0, start)}${section}`;
}

function splitEvidence(value) {
  return String(value || "")
    .split(/[,，、\/\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCheckedQuestionsFromPage() {
  return [...document.querySelectorAll('#dynamicQuestions input[type="checkbox"]:checked')].map((input) => input.value);
}

function replaceSection(draft, startTitle, endTitle, newSection) {
  const start = draft.indexOf(startTitle);
  const end = draft.indexOf(endTitle, start + startTitle.length);
  if (start < 0 || end < 0) return draft;
  return `${draft.slice(0, start)}${newSection}\n\n${draft.slice(end)}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
