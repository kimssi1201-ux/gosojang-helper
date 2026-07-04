const photoInput = document.querySelector("#photoInput");
const clearPhotoBtn = document.querySelector("#clearPhotoBtn");
const photoPreview = document.querySelector("#photoPreview");
const draftPhotoPreview = document.querySelector("#draftPhotoPreview");
const evidenceInput = document.querySelector('[name="evidence"]');
const maxPhotos = 12;
const maxPhotoSize = 10 * 1024 * 1024;
const maxTotalPhotoSize = 50 * 1024 * 1024;

let attachedPhotos = [];

if (photoInput && evidenceInput) {
  photoInput.addEventListener("change", () => {
    clearObjectUrls();
    const selected = limitPhotoFiles([...photoInput.files]);
    attachedPhotos = selected.files
      .map((file) => ({
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
      }));

    renderPhotoLimitNotice(selected.message);
    syncEvidenceText();
    renderPhotoPreviews();
    notifyFormChanged();
  });
}

clearPhotoBtn?.addEventListener("click", () => {
  clearObjectUrls();
  attachedPhotos = [];
  if (photoInput) photoInput.value = "";
  renderPhotoLimitNotice("");
  syncEvidenceText();
  renderPhotoPreviews();
  notifyFormChanged();
});

window.addEventListener("beforeunload", clearObjectUrls);

function syncEvidenceText() {
  const baseText = stripPhotoText(evidenceInput.value);
  const photoText = attachedPhotos.length
    ? `첨부 사진: ${attachedPhotos.map((photo) => photo.name).join(", ")}`
    : "";
  evidenceInput.value = [baseText, photoText].filter(Boolean).join(baseText ? " / " : "");
}

function stripPhotoText(value) {
  return String(value || "")
    .replace(/\s*\/?\s*첨부 사진:.*$/u, "")
    .trim();
}

function renderPhotoPreviews() {
  renderPhotoPreview(photoPreview, true);
  renderPhotoPreview(draftPhotoPreview, false);
  if (clearPhotoBtn) clearPhotoBtn.hidden = attachedPhotos.length === 0;
}

function limitPhotoFiles(files) {
  const images = files.filter((file) => file.type.startsWith("image/") && file.size <= maxPhotoSize);
  const accepted = [];
  let totalSize = 0;
  for (const file of images) {
    if (accepted.length >= maxPhotos) break;
    if (totalSize + file.size > maxTotalPhotoSize) break;
    accepted.push(file);
    totalSize += file.size;
  }
  const skippedCount = files.length - accepted.length;
  return {
    files: accepted,
    message: skippedCount > 0
      ? `큰 사진이나 제한을 넘은 파일 ${skippedCount}개는 제외했습니다. 사진은 최대 ${maxPhotos}장, 1장 ${formatFileSize(maxPhotoSize)} 이하로 첨부해 주세요.`
      : "",
  };
}

function renderPhotoLimitNotice(message) {
  if (!photoPreview) return;
  photoPreview.dataset.limitNotice = message || "";
}

function renderPhotoPreview(target, showHelpText) {
  if (!target) return;
  target.innerHTML = "";
  target.hidden = attachedPhotos.length === 0;
  if (!attachedPhotos.length) return;

  const title = document.createElement("h3");
  title.textContent = "첨부 사진";
  target.append(title);

  if (showHelpText) {
    const note = document.createElement("p");
    note.textContent = target.dataset.limitNotice || "사진은 서버에 저장하지 않고 이 화면에서만 미리보기로 표시됩니다.";
    target.append(note);
  }

  const list = document.createElement("div");
  list.className = "photo-grid";
  for (const photo of attachedPhotos) {
    const item = document.createElement("figure");
    item.className = "photo-item";

    const image = document.createElement("img");
    image.src = photo.url;
    image.alt = photo.name;

    const caption = document.createElement("figcaption");
    caption.textContent = `${photo.name} (${formatFileSize(photo.size)})`;

    item.append(image, caption);
    list.append(item);
  }
  target.append(list);
}

function notifyFormChanged() {
  evidenceInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function clearObjectUrls() {
  for (const photo of attachedPhotos) {
    URL.revokeObjectURL(photo.url);
  }
}

function formatFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}
