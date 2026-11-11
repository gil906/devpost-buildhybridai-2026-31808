import {
  runHybridAirlockPipeline,
  InferenceMode
} from "./airlock-core.mjs";

const CLINICAL_PRESET =
  "Patient: Elena Rostova (DOB: 1981-04-19, SSN: 412-88-9041, MRN-994821A) presented to St. Jude Telemetry Unit on 2026-11-10. Contact: (415) 890-3312, elena.rostova@bayhealth.org, residing at 742 Evergreen Avenue, Suite 4B. Attending Dr. Marcus Vance (NPI: 1841290045) noted paroxysmal atrial fibrillation on Pacemaker SN: UDI-884920-Z. Discharge plan queued under Policy #HPB-7731902.";

const LEGAL_PRESET =
  "CONFIDENTIAL WORK PRODUCT — Client: Viktor Kovalenko, Matter #2026-CV-88412, Counsel: Atty. Clara Reyes (Bar #CA-299104). Counterparty wire instructions reference Account #8890124491 and confidential settlement reserve of $2,450,000.00 executed on 2026-10-28 at 1200 Market Street, Suite 900. Notice email: v.kovalenko@kovalenko-holdings.com, Phone: (212) 555-0194.";

const els = {
  modeSelect: document.getElementById("modeSelect"),
  domainSelect: document.getElementById("domainSelect"),
  rawInput: document.getElementById("rawInput"),
  presetClinicalBtn: document.getElementById("presetClinicalBtn"),
  presetLegalBtn: document.getElementById("presetLegalBtn"),
  pullSelectionBtn: document.getElementById("pullSelectionBtn"),
  runAirlockBtn: document.getElementById("runAirlockBtn"),
  replacePageSelectionBtn: document.getElementById("replacePageSelectionBtn"),
  kpiTotalRedactions: document.getElementById("kpiTotalRedactions"),
  kpiUniqueTokens: document.getElementById("kpiUniqueTokens"),
  kpiResidualCount: document.getElementById("kpiResidualCount"),
  kpiLatency: document.getElementById("kpiLatency"),
  redactedOutput: document.getElementById("redactedOutput"),
  gatekeeperStatus: document.getElementById("gatekeeperStatus"),
  gatekeeperBytes: document.getElementById("gatekeeperBytes"),
  gatekeeperHash: document.getElementById("gatekeeperHash"),
  vaultTableBody: document.getElementById("vaultTableBody"),
  rehydrateToggle: document.getElementById("rehydrateToggle"),
  synthesisOutput: document.getElementById("synthesisOutput"),
  engineBadge: document.getElementById("engineBadge")
};

let lastPipelineResult = null;

function renderPipelineResult(result) {
  lastPipelineResult = result;
  const { scrubResult, gatekeeper } = result;

  els.kpiTotalRedactions.textContent = String(scrubResult.totalRedactions);
  els.kpiUniqueTokens.textContent = String(scrubResult.uniqueTokenCount);
  els.kpiResidualCount.textContent = String(gatekeeper.residualCount);
  els.kpiLatency.textContent = `${result.latencyMs}ms`;

  els.redactedOutput.textContent = scrubResult.redactedText;
  els.engineBadge.textContent = (result.engineUsed || "HYBRID").toUpperCase();

  els.gatekeeperStatus.textContent = gatekeeper.passed
    ? "ZERO-PII PROOF VERIFIED (PASSED)"
    : "GATEKEEPER BLOCKED OUTBOUND";
  els.gatekeeperBytes.textContent = `${gatekeeper.outboundBytes} B`;
  els.gatekeeperHash.textContent = `SHA-256: ${gatekeeper.sha256Attestation}`;

  const entries = Object.values(scrubResult.tokenVault || {});
  if (entries.length === 0) {
    els.vaultTableBody.innerHTML =
      '<tr><td colspan="4" class="empty-cell">No PII identifiers detected in input.</td></tr>';
  } else {
    els.vaultTableBody.innerHTML = entries
      .map(
        (item) => `
        <tr>
          <td class="text-amber">${item.token}</td>
          <td class="text-safe">${item.category}</td>
          <td>${item.masked}</td>
          <td>${item.hipaaRule.split("—")[0].trim()}</td>
        </tr>`
      )
      .join("");
  }

  updateSynthesisView();
}

function updateSynthesisView() {
  if (!lastPipelineResult) return;
  els.synthesisOutput.textContent = els.rehydrateToggle.checked
    ? lastPipelineResult.rehydratedSummary
    : lastPipelineResult.cloudRedactedSummary;
}

async function executeAirlock() {
  const rawText = els.rawInput.value.trim();
  if (!rawText) return;

  const mode = els.modeSelect.value || InferenceMode.PREFER_ON_DEVICE;
  const domain = els.domainSelect.value || "clinical";

  const result = await runHybridAirlockPipeline(rawText, { mode, domain });
  renderPipelineResult(result);
}

els.presetClinicalBtn.addEventListener("click", () => {
  els.domainSelect.value = "clinical";
  els.rawInput.value = CLINICAL_PRESET;
  executeAirlock();
});

els.presetLegalBtn.addEventListener("click", () => {
  els.domainSelect.value = "legal";
  els.rawInput.value = LEGAL_PRESET;
  executeAirlock();
});

els.runAirlockBtn.addEventListener("click", () => {
  executeAirlock();
});

els.modeSelect.addEventListener("change", () => {
  executeAirlock();
});

els.domainSelect.addEventListener("change", () => {
  executeAirlock();
});

els.rehydrateToggle.addEventListener("change", () => {
  updateSynthesisView();
});

els.pullSelectionBtn.addEventListener("click", async () => {
  if (!globalThis.chrome?.tabs) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "PIIZERO_GET_PAGE_SELECTION" }, (resp) => {
    if (resp?.selectionText) {
      els.rawInput.value = resp.selectionText;
      executeAirlock();
    }
  });
});

els.replacePageSelectionBtn.addEventListener("click", async () => {
  if (!lastPipelineResult?.scrubResult?.redactedText || !globalThis.chrome?.tabs) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "PIIZERO_REPLACE_PAGE_SELECTION",
    redactedText: lastPipelineResult.scrubResult.redactedText
  });
});

if (globalThis.chrome?.storage?.local) {
  chrome.storage.local.get(["piizeroLastCapture"], (data) => {
    if (data?.piizeroLastCapture?.rawText) {
      els.rawInput.value = data.piizeroLastCapture.rawText;
      if (data.piizeroLastCapture.pipelineResult) {
        renderPipelineResult(data.piizeroLastCapture.pipelineResult);
      } else {
        executeAirlock();
      }
    } else {
      els.rawInput.value = CLINICAL_PRESET;
      executeAirlock();
    }
  });

  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg?.type === "PIIZERO_CAPTURE_UPDATED" && msg.payload?.rawText) {
      els.rawInput.value = msg.payload.rawText;
      if (msg.payload.pipelineResult) {
        renderPipelineResult(msg.payload.pipelineResult);
      } else {
        executeAirlock();
      }
    }
  });
} else {
  els.rawInput.value = CLINICAL_PRESET;
  executeAirlock();
}
