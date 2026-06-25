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
  let draft = consistencyEditor.value;
  draft = patchPersonName(draft, "1. 고소인*", data.complainant || "[고소인 성명]");
  draft = patchPersonName(draft, "2. 피고소인*", data.accused || "[피고소인 성명 또는 성명불상]");
  draft = patchPurpose(draft, data);
  draft = patchFacts(draft, data);
  draft = patchEvidence(draft, data);

  consistencyEditor.value = draft;
  consistencyLastSnapshot = getConsistencySnapshot();
  consistencyApplying = false;
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
    accused: data.accused || "",
    caseTypeName: data.caseTypeName || "",
    incidentDate: data.incidentDate || "",
    incidentPlace: data.incidentPlace || "",
    damage: data.damage || "",
    evidence: data.evidence || "",
    story: data.story || "",
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
  return draft.replace(pattern, `$1성명: ${name}`);
}

function patchPurpose(draft, data) {
  const purpose = `고소인은 피고소인을 ${data.caseTypeName || "관련 범죄"} 혐의로 고소하오니, 철저히 수사하여 법에 따라 처벌하여 주시기 바랍니다.`;
  return replaceSection(draft, "3. 고소취지*", "4. 범죄사실*", ["3. 고소취지*", purpose].join("\n"));
}

function patchFacts(draft, data) {
  const oldSection = extractSection(draft, "4. 범죄사실*", "5. 고소이유");
  const oldBody = oldSection
    .replace(/^4\. 범죄사실\*\s*/u, "")
    .split("\n")
    .filter((line) => !/^가\. 사건 일시:|^나\. 사건 장소:|^다\. 피해 내용:|^라\. 사건 유형:|^마\. 상세 경위\s*$/u.test(line.trim()))
    .join("\n")
    .trim();

  const detail = oldBody || data.story || "[사건 경위를 시간순으로 구체적으로 기재합니다.]";
  const section = [
    "4. 범죄사실*",
    `가. 사건 일시: ${data.incidentDate || "[일시 기재]"}`,
    `나. 사건 장소: ${data.incidentPlace || "[장소 기재]"}`,
    `다. 피해 내용: ${data.damage || "[피해금액 또는 피해내용 기재]"}`,
    `라. 사건 유형: ${data.caseTypeName || "[범죄유형]"}`,
    "",
    "마. 상세 경위",
    detail,
  ].join("\n");

  return replaceSection(draft, "4. 범죄사실*", "5. 고소이유", section);
}

function patchEvidence(draft, data) {
  const checkedLine = data.evidence
    ? "☑ 고소인은 고소인의 진술 외에 제출할 증거가 있습니다."
    : "□ 고소인은 고소인의 진술 외에 제출할 증거가 없습니다.";
  const evidenceLine = `증거자료: ${data.evidence || "[문자, 카카오톡, 계좌이체내역, 사진, 진단서, 녹취, CCTV 등]"}`;
  const section = ["6. 증거자료", checkedLine, evidenceLine].join("\n");
  return replaceSection(draft, "6. 증거자료", "7. 관련사건의 수사 및 재판 여부*", section);
}

function extractSection(draft, startTitle, endTitle) {
  const start = draft.indexOf(startTitle);
  const end = draft.indexOf(endTitle, start + startTitle.length);
  if (start < 0 || end < 0) return "";
  return draft.slice(start, end).trim();
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
