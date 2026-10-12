/* Opt-in installation; no automatic prompts. The worker caches public shells,
 * never browser storage, API responses, or OAuth query URLs.
 */
(() => {
  "use strict";
  const button = document.getElementById("install-app");
  let promptEvent = null;
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(navigator.userAgent);
  function updateButton() { if (button) { button.hidden = standalone(); button.disabled = false; } }
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); promptEvent = event; updateButton(); });
  window.addEventListener("appinstalled", () => { promptEvent = null; if (button) button.hidden = true; });
  function instructions() {
    let dialog = document.getElementById("install-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "install-dialog";
      dialog.setAttribute("aria-labelledby", "install-title");
      Object.assign(dialog.style, { background: "#103a36", color: "#e5eee5", border: "1px solid #63816b", borderRadius: "12px", padding: "24px", maxWidth: "420px", width: "calc(100% - 36px)", fontFamily: "inherit", lineHeight: "1.6" });
      const heading = document.createElement("h2"); heading.id = "install-title"; heading.textContent = "Add to phone"; heading.style.marginTop = "0";
      const text = document.createElement("p");
      text.textContent = appleMobile ? "Open Molomon in Safari. Tap Share, then Add to Home Screen, then Add." : android ? "Open Molomon in Chrome. Tap the ⋮ menu, then Add to home screen or Install app." : "On iPhone: open Molomon in Safari, tap Share, then Add to Home Screen. On Android: open in Chrome, tap ⋮, then Add to home screen or Install app.";
      const close = document.createElement("button"); close.type = "button"; close.textContent = "Done"; close.autofocus = true;
      Object.assign(close.style, { padding: "10px 18px", minHeight: "44px", borderRadius: "6px", border: "0", background: "#b9d8bf", color: "#082f2d", cursor: "pointer", font: "inherit" });
      close.addEventListener("click", () => dialog.close());
      dialog.append(heading, text, close); document.body.append(dialog);
      dialog.addEventListener("close", () => { if (button && !button.hidden) button.focus(); });
    }
    if (!dialog.open) dialog.showModal();
  }
  if (button) button.addEventListener("click", async () => {
    if (promptEvent && !appleMobile) {
      const pending = promptEvent; promptEvent = null;
      try { await pending.prompt(); const choice = await pending.userChoice; if (choice.outcome === "accepted") button.hidden = true; }
      catch { instructions(); }
    } else instructions();
  });
  updateButton();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))) {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./", updateViaCache: "none" }).then(registration => registration.update()).catch(() => { /* The hub remains usable without offline support. */ });
  }
})();
