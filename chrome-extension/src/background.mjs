import {
  scrubText,
  verifyZeroPiiGatekeeper,
  runHybridAirlockPipeline,
  InferenceMode
} from "./airlock-core.mjs";

const CONTEXT_MENU_ID = "piizero-scrub-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Scrub PII & Analyze via PII-Zero Hybrid Airlock",
    contexts: ["selection", "editable", "page"]
  });

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  if (tab?.id && chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (_) {}
  }

  const rawText = (info.selectionText || "").trim();
  if (rawText) {
    const pipelineResult = await runHybridAirlockPipeline(rawText, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      domain: "clinical"
    });
    await chrome.storage.local.set({
      piizeroLastCapture: {
        rawText,
        sourceUrl: tab?.url || info.pageUrl || "",
        sourceTitle: tab?.title || "Active Clinical / Legal Tab",
        capturedAt: new Date().toISOString(),
        pipelineResult
      }
    });
    chrome.runtime.sendMessage({
      type: "PIIZERO_CAPTURE_UPDATED",
      payload: {
        rawText,
        sourceUrl: tab?.url || info.pageUrl || "",
        sourceTitle: tab?.title || "Active Clinical / Legal Tab",
        pipelineResult
      }
    }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "PIIZERO_RUN_AIRLOCK") {
    runHybridAirlockPipeline(message.rawText || "", {
      mode: message.mode || InferenceMode.PREFER_ON_DEVICE,
      domain: message.domain || "clinical",
      firebaseConfig: message.firebaseConfig || null
    })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (message.type === "PIIZERO_QUICK_SCRUB") {
    const scrub = scrubText(message.rawText || "", { domain: message.domain || "clinical" });
    verifyZeroPiiGatekeeper(scrub.redactedText)
      .then((gatekeeper) => sendResponse({ ok: true, scrub, gatekeeper }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});
