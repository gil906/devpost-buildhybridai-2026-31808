(() => {
  let lastActiveElement = null;

  document.addEventListener("selectionchange", () => {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "TEXTAREA" ||
        (active.tagName === "INPUT" && /text|search|email|tel|url/i.test(active.type || "text")) ||
        active.isContentEditable)
    ) {
      lastActiveElement = active;
    }
  });

  function getSelectedTextFromPage() {
    const active = document.activeElement || lastActiveElement;
    if (
      active &&
      (active.tagName === "TEXTAREA" ||
        (active.tagName === "INPUT" && typeof active.selectionStart === "number"))
    ) {
      const start = active.selectionStart ?? 0;
      const end = active.selectionEnd ?? 0;
      if (end > start) {
        return active.value.slice(start, end);
      }
      if (active.value && active.value.trim().length > 0) {
        return active.value;
      }
    }
    const sel = window.getSelection();
    return sel ? sel.toString() : "";
  }

  function replaceSelectionOnPage(redactedText) {
    const active = document.activeElement || lastActiveElement;
    if (
      active &&
      (active.tagName === "TEXTAREA" ||
        (active.tagName === "INPUT" && typeof active.selectionStart === "number"))
    ) {
      const start = active.selectionStart ?? 0;
      const end = active.selectionEnd ?? 0;
      if (end > start) {
        active.setRangeText(redactedText, start, end, "select");
      } else {
        active.value = redactedText;
      }
      active.dispatchEvent(new Event("input", { bubbles: true }));
      showAirlockToast("Replaced form selection with PII-Zero redacted text");
      return { replaced: true, target: active.tagName.toLowerCase() };
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(redactedText));
      showAirlockToast("Replaced page selection with [PII_*] tokens");
      return { replaced: true, target: "dom-selection" };
    }

    return { replaced: false, reason: "No active text selection or editable field found on page." };
  }

  function showAirlockToast(message) {
    const existing = document.getElementById("piizero-airlock-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "piizero-airlock-toast";
    toast.textContent = `PII-Zero Airlock: ${message}`;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "2147483647",
      background: "#111c26",
      color: "#8dd6c7",
      border: "1px solid #263849",
      borderLeft: "3px solid #8dd6c7",
      padding: "10px 14px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "12px",
      letterSpacing: "0.02em",
      boxShadow: "0 8px 24px rgba(0,0,0,0.45)"
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return false;

    if (msg.type === "PIIZERO_GET_PAGE_SELECTION") {
      sendResponse({
        ok: true,
        selectionText: getSelectedTextFromPage(),
        pageTitle: document.title,
        pageUrl: location.href
      });
      return false;
    }

    if (msg.type === "PIIZERO_REPLACE_PAGE_SELECTION") {
      const outcome = replaceSelectionOnPage(String(msg.redactedText || ""));
      sendResponse({ ok: outcome.replaced, ...outcome });
      return false;
    }

    return false;
  });
})();
