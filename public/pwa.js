(() => {
  const installButton = document.querySelector("#installAppBtn");
  const installHelp = document.querySelector("#installHelpText");
  let deferredPrompt = null;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (installButton) installButton.hidden = false;
    if (installHelp) installHelp.textContent = "설치하기를 누르면 휴대폰 앱처럼 바로 열 수 있습니다.";
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredPrompt) {
      if (installHelp) installHelp.textContent = "아이폰은 공유 버튼을 누른 뒤 홈 화면에 추가를 선택하세요.";
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    if (installHelp) installHelp.textContent = "설치가 완료되었습니다.";
    if (installButton) installButton.hidden = true;
  });
})();
