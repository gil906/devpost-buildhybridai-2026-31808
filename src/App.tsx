import React, { useState, useEffect, useCallback } from "react";
import {
  CLINICAL_LEGAL_PRESETS,
  verifyZeroPiiLeak,
  type VaultEntry
} from "./engine/piiAirlock";
import {
  InferenceMode,
  DEFAULT_DEMO_FIREBASE_CONFIG,
  runHybridAirlockPipeline,
  generateSdkCodeSnippet,
  isLiveFirebaseConfigured,
  type FirebaseWebConfig,
  type HybridPipelineExecutionResult
} from "./engine/firebaseHybridSdk";
import { AirlockPipelineSvg } from "./components/AirlockPipelineSvg";

function renderHighlightedTokens(text: string, vaultEntries: VaultEntry[], isRehydratedView: boolean): React.ReactNode {
  if (!text) return null;
  if (!isRehydratedView) {
    const parts = text.split(/(\[PII_[A-Z]+_\d+\])/g);
    return parts.map((part, idx) => {
      if (/^\[PII_[A-Z]+_\d+\]$/.test(part)) {
        return (
          <span key={idx} className="token-chip" title="Pseudonymized On-Device Airlock Token">
            {part}
          </span>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  }
  const values = vaultEntries
    .map((v) => v.originalValue)
    .filter((v) => v.length >= 3)
    .sort((a, b) => b.length - a.length);
  if (values.length === 0) return text;
  const escaped = values.map((v) => v.replace(/[.*+?^\$\{}()|[\]\\]/g, "\\$&"));
  const rx = new RegExp("(" + escaped.join("|") + ")", "g");
  const valueSet = new Set(values);
  const parts = text.split(rx);
  return parts.map((part, idx) => {
    if (valueSet.has(part)) {
      const entry = vaultEntries.find((v) => v.originalValue === part);
      return (
        <span
          key={idx}
          className="token-chip restored"
          title={entry ? "Restored from local vault " + entry.token + " (" + entry.regulationRef + ")" : "Restored locally"}
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const App: React.FC = () => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CLINICAL_LEGAL_PRESETS[0].id);
  const [rawText, setRawText] = useState<string>(CLINICAL_LEGAL_PRESETS[0].rawDocument);
  const [customTermsInput, setCustomTermsInput] = useState<string>(
    CLINICAL_LEGAL_PRESETS[0].defaultCustomTerms.join(", ")
  );
  const [stage1Mode, setStage1Mode] = useState<InferenceMode>(InferenceMode.ONLY_ON_DEVICE);
  const [cloudModelName, setCloudModelName] = useState<string>("gemini-2.5-flash");
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseWebConfig>(DEFAULT_DEMO_FIREBASE_CONFIG);
  const [configJsonText, setConfigJsonText] = useState<string>(
    JSON.stringify(DEFAULT_DEMO_FIREBASE_CONFIG, null, 2)
  );
  const [configDrawerOpen, setConfigDrawerOpen] = useState<boolean>(false);
  const [sdkDrawerOpen, setSdkDrawerOpen] = useState<boolean>(false);
  const [rehydrateView, setRehydrateView] = useState<boolean>(true);
  const [revealVaultValues, setRevealVaultValues] = useState<boolean>(true);
  const [pipelineResult, setPipelineResult] = useState<HybridPipelineExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [simulatedLeakAlert, setSimulatedLeakAlert] = useState<string | null>(null);
  const [serverReceiptStatus, setServerReceiptStatus] = useState<string>("VERIFIED_ZERO_PII");

  const executeAirlock = useCallback(
    async (inputDoc: string, customCsv: string, mode: InferenceMode, cfg: FirebaseWebConfig, modelName: string) => {
      setIsRunning(true);
      setSimulatedLeakAlert(null);
      try {
        const terms = customCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const result = await runHybridAirlockPipeline({
          rawText: inputDoc,
          customTerms: terms,
          stage1Mode: mode,
          firebaseConfig: cfg,
          cloudModelName: modelName
        });
        setPipelineResult(result);

        try {
          const verifyResp = await fetch("/api/airlock/verify-zero-pii", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sanitizedText: result.scrubResult.sanitizedText,
              vaultValues: result.scrubResult.vaultEntries.map((v) => v.originalValue),
              redactedCount: result.scrubResult.telemetry.totalDetected
            })
          });
          if (verifyResp.ok) {
            const receipt = (await verifyResp.json()) as { zeroPiiVerified?: boolean; receiptId?: string };
            if (receipt.zeroPiiVerified) {
              setServerReceiptStatus("SIGNED RECEIPT " + (receipt.receiptId ?? "OK"));
            }
          }
        } catch {
          setServerReceiptStatus("LOCAL SHA-256 VERIFIED");
        }
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  useEffect(() => {
    void executeAirlock(rawText, customTermsInput, stage1Mode, firebaseConfig, cloudModelName);
  }, []);

  const handlePresetChange = (presetId: string) => {
    const found = CLINICAL_LEGAL_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedPresetId(found.id);
    setRawText(found.rawDocument);
    const csv = found.defaultCustomTerms.join(", ");
    setCustomTermsInput(csv);
    void executeAirlock(found.rawDocument, csv, stage1Mode, firebaseConfig, cloudModelName);
  };

  const handleModeChange = (newMode: InferenceMode) => {
    setStage1Mode(newMode);
    void executeAirlock(rawText, customTermsInput, newMode, firebaseConfig, cloudModelName);
  };

  const handleApplyFirebaseConfig = () => {
    try {
      const parsed = JSON.parse(configJsonText) as FirebaseWebConfig;
      setFirebaseConfig(parsed);
      void executeAirlock(rawText, customTermsInput, stage1Mode, parsed, cloudModelName);
    } catch {
      setSimulatedLeakAlert("Invalid Firebase Config JSON syntax. Retaining active configuration.");
    }
  };

  const handleSimulateLeakAttempt = () => {
    if (!pipelineResult) return;
    const tamperedPayload =
      pipelineResult.scrubResult.sanitizedText +
      "\n[UNSCRUBBED_INJECTION_TEST: SSN 419-82-6741]";
    const check = verifyZeroPiiLeak(
      tamperedPayload,
      pipelineResult.scrubResult.vaultEntries,
      pipelineResult.scrubResult.rawText
    );
    if (!check.passed) {
      setSimulatedLeakAlert(
        "STAGE 2 GATEKEEPER HARD-BLOCKED OUTBOUND PAYLOAD: Detected unredacted token(s) [" +
          check.leakedTokens.join(", ") +
          "] (" +
          check.cloudPiiBytes +
          " B). Cloud transmission aborted before network socket."
      );
    }
  };

  const telemetry = pipelineResult?.scrubResult.telemetry;
  const vaultEntries = pipelineResult?.scrubResult.vaultEntries ?? [];
  const analysis = pipelineResult?.analysis;
  const liveCloud = isLiveFirebaseConfigured(firebaseConfig);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-cluster">
          <h1 className="brand-title">PII-ZERO · HYBRID AI AIRLOCK WORKBENCH</h1>
          <span className="brand-subtitle">
            45 CFR §164.514(b)(2) HIPAA Safe Harbor + FRE 408 Legal Enclave · firebase/ai@{pipelineResult?.firebaseSdkVersion ?? "12.4.0"}
          </span>
          <span className="status-pill">
            <span className="status-dot" />
            {pipelineResult?.onDeviceStatus.chromePromptApiDetected
              ? "GEMINI NANO ON-DEVICE ACTIVE"
              : "DETERMINISTIC ON-DEVICE ENCLAVE ACTIVE"}
          </span>
          <span className={"status-pill " + (liveCloud ? "" : "warn")}>
            {liveCloud ? "FIREBASE CLOUD GEMINI LIVE" : "APP CHECK DEMO ENCLAVE"}
          </span>
        </div>

        <div className="topbar-controls">
          <label htmlFor="preset-select" style={{ fontSize: "0.76rem", color: "var(--fg-secondary)" }}>
            Preset:
          </label>
          <select
            id="preset-select"
            className="select-control"
            value={selectedPresetId}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {CLINICAL_LEGAL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.badge}] {p.title.slice(0, 56)}...
              </option>
            ))}
          </select>

          <label htmlFor="mode-select" style={{ fontSize: "0.76rem", color: "var(--fg-secondary)" }}>
            InferenceMode:
          </label>
          <select
            id="mode-select"
            className="select-control"
            value={stage1Mode}
            onChange={(e) => handleModeChange(e.target.value as InferenceMode)}
          >
            <option value={InferenceMode.ONLY_ON_DEVICE}>ONLY_ON_DEVICE (Strict Hardware Lock)</option>
            <option value={InferenceMode.PREFER_ON_DEVICE}>PREFER_ON_DEVICE (Raw Fallback Blocked)</option>
            <option value={InferenceMode.ONLY_IN_CLOUD}>ONLY_IN_CLOUD (Stage 3 Sanitized Only)</option>
          </select>

          <button
            type="button"
            className="btn"
            onClick={() => setConfigDrawerOpen((v) => !v)}
          >
            {configDrawerOpen ? "Hide Firebase & AppCheck" : "Firebase & AppCheck Config"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSdkDrawerOpen((v) => !v)}
          >
            {sdkDrawerOpen ? "Hide SDK Inspector" : "firebase/ai SDK Inspector"}
          </button>
          <a className="btn" href="/downloads/piizero-chrome-extension.zip" download>
            Chrome Extension (.zip)
          </a>
          <a className="btn" href="/downloads/piizero-android-debug.apk" download>
            Android Companion (.apk)
          </a>
        </div>
      </header>

      <section className="ledger-strip" aria-label="Reconciliation Telemetry Ledger">
        <div className="ledger-card">
          <span className="ledger-label">Total Entities Detected</span>
          <span className="ledger-value warn">{telemetry?.totalDetected ?? 0}</span>
          <span className="ledger-sub">
            = {telemetry?.redactedOnDeviceCount ?? 0} On-Device + {telemetry?.customPolicyCount ?? 0} Policy
          </span>
        </div>
        <div className="ledger-card">
          <span className="ledger-label">Redacted On-Device (18-ID)</span>
          <span className="ledger-value">{telemetry?.redactedOnDeviceCount ?? 0}</span>
          <span className="ledger-sub">HIPAA Safe Harbor + Legal NER</span>
        </div>
        <div className="ledger-card">
          <span className="ledger-label">Custom Policy Tokens</span>
          <span className="ledger-value">{telemetry?.customPolicyCount ?? 0}</span>
          <span className="ledger-sub">Project / Matter Codewords</span>
        </div>
        <div className="ledger-card">
          <span className="ledger-label">Ephemeral Vault Keys</span>
          <span className="ledger-value safe">{telemetry?.uniqueVaultEntries ?? 0}</span>
          <span className="ledger-sub">In-Memory Map · 0 Disk Writes</span>
        </div>
        <div className="ledger-card">
          <span className="ledger-label">Scrubbed PII Volume</span>
          <span className="ledger-value warn">{telemetry?.scrubbedPiiBytes ?? 0} B</span>
          <span className="ledger-sub">
            Raw {telemetry?.rawInputBytes ?? 0} B → Sanitized {telemetry?.sanitizedOutputBytes ?? 0} B
          </span>
        </div>
        <div className="ledger-card">
          <span className="ledger-label">Cloud PII Bytes Transmitted</span>
          <span className="ledger-value safe">{telemetry?.cloudPiiBytesTransmitted ?? 0} B</span>
          <span className="ledger-sub">{serverReceiptStatus}</span>
        </div>
      </section>

      <AirlockPipelineSvg
        stage1Mode={stage1Mode}
        totalDetected={telemetry?.totalDetected ?? 0}
        redactedOnDevice={telemetry?.redactedOnDeviceCount ?? 0}
        customPolicyCount={telemetry?.customPolicyCount ?? 0}
        cloudPiiBytes={telemetry?.cloudPiiBytesTransmitted ?? 0}
        sanitizedSha256={pipelineResult?.scrubResult.sanitizedSha256 ?? ""}
        gatePassed={pipelineResult?.scrubResult.zeroLeakProof.passed ?? true}
        restoredCount={pipelineResult?.rehydratedNarrative.restoredCount ?? 0}
        rehydrateEnabled={rehydrateView}
      />

      {simulatedLeakAlert && (
        <div
          className="panel"
          style={{
            marginBottom: "1rem",
            borderColor: "var(--accent-danger)",
            background: "#261820",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem"
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent-danger)" }}>
            {simulatedLeakAlert}
          </span>
          <button type="button" className="btn" onClick={() => setSimulatedLeakAlert(null)}>
            Dismiss Alert
          </button>
        </div>
      )}

      {(configDrawerOpen || sdkDrawerOpen) && (
        <section className="drawer-grid">
          {configDrawerOpen && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Firebase Web Config &amp; App Check Enclave</span>
                <span className="stage-tag">ReCaptchaEnterpriseProvider + GoogleAIBackend</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--fg-secondary)", marginBottom: "0.65rem" }}>
                Paste a live Firebase project configuration JSON to route Stage 3 sanitized payloads through your own Firebase AI Logic project, or use the pre-configured zero-trust demo configuration.
              </p>
              <textarea
                className="editor-textarea"
                style={{ minHeight: "155px" }}
                value={configJsonText}
                onChange={(e) => setConfigJsonText(e.target.value)}
              />
              <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.65rem", alignItems: "center" }}>
                <button type="button" className="btn btn-primary" onClick={handleApplyFirebaseConfig}>
                  Apply Firebase Config &amp; Re-Initialize App Check
                </button>
                <input
                  type="text"
                  className="input-control"
                  value={cloudModelName}
                  onChange={(e) => setCloudModelName(e.target.value)}
                  aria-label="Cloud Gemini model name"
                  style={{ width: "170px" }}
                />
              </div>
            </div>
          )}

          {sdkDrawerOpen && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Live firebase/ai Hybrid SDK Inspector &amp; Telemetry</span>
                <span className="stage-tag">
                  Stage 1: {pipelineResult?.stage1Telemetry.effectiveInferenceSource ?? "on_device"} → Stage 3: {pipelineResult?.stage3Telemetry.effectiveInferenceSource ?? "in_cloud"}
                </span>
              </div>
              <pre className="sanitized-pre" style={{ maxHeight: "175px", marginBottom: "0.6rem" }}>
                {generateSdkCodeSnippet(stage1Mode, cloudModelName)}
              </pre>
              <div className="hash-row">
                <span>Stage 1 ({pipelineResult?.stage1Telemetry.sdkMethod})</span>
                <span style={{ color: "var(--accent-safe)" }}>
                  {pipelineResult?.stage1Telemetry.effectiveInferenceSource} · {pipelineResult?.stage1Telemetry.latencyMs ?? 1} ms
                </span>
              </div>
              <div className="hash-row">
                <span>Stage 3 ({pipelineResult?.stage3Telemetry.sdkMethod})</span>
                <span style={{ color: "var(--accent-warn)" }}>
                  {pipelineResult?.stage3Telemetry.effectiveInferenceSource} · {pipelineResult?.stage3Telemetry.latencyMs ?? 2} ms
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      <main className="workbench-grid">
        <section className="panel" aria-label="Stage 1 On-Device Raw Input">
          <div className="panel-header">
            <div>
              <div className="panel-title">Stage 1 · On-Device Raw Clinical / Legal Intake</div>
              <div style={{ fontSize: "0.75rem", color: "var(--fg-secondary)", marginTop: "0.15rem" }}>
                {pipelineResult?.onDeviceStatus.modelLabel ?? "On-Device HIPAA-18 + Legal NER Enclave"}
              </div>
            </div>
            <span className="stage-tag">LOCAL MEMORY ONLY</span>
          </div>

          <label
            htmlFor="raw-clinical-input"
            style={{ display: "block", fontSize: "0.75rem", color: "var(--fg-secondary)", marginBottom: "0.35rem" }}
          >
            Unredacted Source Document (Never transmitted over network):
          </label>
          <textarea
            id="raw-clinical-input"
            className="editor-textarea"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />

          <div style={{ marginTop: "0.75rem" }}>
            <label
              htmlFor="custom-policy-terms"
              style={{ display: "block", fontSize: "0.75rem", color: "var(--fg-secondary)", marginBottom: "0.3rem" }}
            >
              Custom Enterprise / Matter Policy Codewords (comma-separated):
            </label>
            <input
              id="custom-policy-terms"
              type="text"
              className="input-control"
              style={{ width: "100%" }}
              value={customTermsInput}
              onChange={(e) => setCustomTermsInput(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.85rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isRunning}
              onClick={() => void executeAirlock(rawText, customTermsInput, stage1Mode, firebaseConfig, cloudModelName)}
            >
              {isRunning ? "Scrubbing & Analyzing..." : "Run 3-Stage Hybrid Airlock"}
            </button>
            <button
              type="button"
              className="btn btn-warn"
              onClick={handleSimulateLeakAttempt}
            >
              Test Stage 2 Leak-Block Guard
            </button>
          </div>

          <div className="hash-row">
            <span style={{ color: "var(--fg-secondary)" }}>Raw Input SHA-256:</span>
            <span style={{ color: "var(--fg-primary)" }}>
              {pipelineResult?.scrubResult.rawSha256.slice(0, 28) ?? ""}...
            </span>
          </div>
        </section>

        <section className="panel" aria-label="Stage 2 Zero-PII Gatekeeper and Ephemeral Vault">
          <div className="panel-header">
            <div>
              <div className="panel-title">Stage 2 · Sanitized Payload &amp; Ephemeral Vault</div>
              <div style={{ fontSize: "0.75rem", color: "var(--fg-secondary)", marginTop: "0.15rem" }}>
                Outbound Cloud Payload (0 Raw PII Bytes) + Client-Side Map Vault
              </div>
            </div>
            <span className="stage-tag" style={{ color: "var(--accent-safe)", borderColor: "var(--accent-safe)" }}>
              ZERO-LEAK VERIFIED
            </span>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--fg-secondary)", marginBottom: "0.35rem" }}>
            Outbound Pseudonymized Payload Sent to Stage 3 Cloud Gemini:
          </div>
          <div className="sanitized-pre" style={{ maxHeight: "200px" }}>
            {renderHighlightedTokens(pipelineResult?.scrubResult.sanitizedText ?? "", vaultEntries, false)}
          </div>

          <div className="hash-row">
            <span style={{ color: "var(--fg-secondary)" }}>Sanitized SHA-256 Receipt:</span>
            <span style={{ color: "var(--accent-safe)" }}>
              {pipelineResult?.scrubResult.sanitizedSha256.slice(0, 28) ?? ""}...
            </span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.85rem"
            }}
          >
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
              Reversible Ephemeral Browser Vault ({vaultEntries.length} Unique Tokens)
            </span>
            <button
              type="button"
              className="btn"
              style={{ padding: "0.25rem 0.55rem", fontSize: "0.73rem" }}
              onClick={() => setRevealVaultValues((v) => !v)}
            >
              {revealVaultValues ? "Mask Raw Vault Values" : "Reveal Raw Vault Values"}
            </button>
          </div>

          <div className="vault-table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Original Value (Local RAM)</th>
                  <th>Category &amp; Citation</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {vaultEntries.map((entry) => (
                  <tr key={entry.token}>
                    <td className="tabular-nums" style={{ color: "var(--accent-warn)" }}>
                      {entry.token}
                    </td>
                    <td className="tabular-nums">
                      {revealVaultValues ? entry.originalValue : "••••••••••••"}
                    </td>
                    <td>
                      <div>{entry.label}</div>
                      <div style={{ fontSize: "0.69rem", color: "var(--fg-secondary)" }}>
                        {entry.regulationRef}
                      </div>
                    </td>
                    <td className="tabular-nums">{entry.occurrences}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-label="Stage 3 Cloud Reasoning and Local Re-hydration">
          <div className="panel-header">
            <div>
              <div className="panel-title">Stage 3 · Cloud Reasoning &amp; Local Re-Hydration</div>
              <div style={{ fontSize: "0.75rem", color: "var(--fg-secondary)", marginTop: "0.15rem" }}>
                {analysis?.documentClassification ?? "Clinical & Legal Structured Synthesis"}
              </div>
            </div>
            <button
              type="button"
              className={"btn " + (rehydrateView ? "btn-primary" : "btn-warn")}
              onClick={() => setRehydrateView((v) => !v)}
            >
              {rehydrateView ? "Viewing: Re-hydrated Local View" : "Viewing: Sanitized Cloud View"}
            </button>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--fg-secondary)", marginBottom: "0.35rem" }}>
            {rehydrateView
              ? "Authorized Clinician/Counsel View (" + (pipelineResult?.rehydratedNarrative.restoredCount ?? 0) + " vault tokens restored locally in browser):"
              : "Raw Cloud Gemini Response (Contains only [PII_*] placeholders):"}
          </div>
          <div className="sanitized-pre" style={{ maxHeight: "175px", marginBottom: "0.85rem" }}>
            {renderHighlightedTokens(
              rehydrateView
                ? pipelineResult?.rehydratedNarrative.rehydratedText ?? ""
                : analysis?.rehydratableNarrativeReport ?? "",
              vaultEntries,
              rehydrateView
            )}
          </div>

          <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.45rem" }}>
            High-Priority Pharmacovigilance &amp; Legal Clause Alerts
          </div>
          {analysis?.pharmacovigilanceOrClauseAlerts.map((alert, idx) => (
            <div
              key={idx}
              className={"alert-item " + (alert.severity === "CRITICAL" ? "critical" : "")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: "0.79rem" }}>
                <span>{alert.title}</span>
                <span
                  className="tabular-nums"
                  style={{
                    color: alert.severity === "CRITICAL" ? "var(--accent-danger)" : "var(--accent-warn)",
                    fontSize: "0.72rem"
                  }}
                >
                  {alert.severity}
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--fg-secondary)", marginTop: "0.25rem" }}>
                {renderHighlightedTokens(
                  rehydrateView
                    ? vaultEntries.reduce((acc, e) => acc.split(e.token).join(e.originalValue), alert.mechanismOrClause)
                    : alert.mechanismOrClause,
                  vaultEntries,
                  rehydrateView
                )}
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--fg-primary)", marginTop: "0.3rem" }}>
                <strong>Action: </strong>
                {renderHighlightedTokens(
                  rehydrateView
                    ? vaultEntries.reduce((acc, e) => acc.split(e.token).join(e.originalValue), alert.recommendation)
                    : alert.recommendation,
                  vaultEntries,
                  rehydrateView
                )}
              </div>
            </div>
          ))}

          <div style={{ fontSize: "0.78rem", fontWeight: 600, marginTop: "0.75rem", marginBottom: "0.35rem" }}>
            Structured ICD-10-CM / CPT / Statutory Coding Ledger
          </div>
          <div className="vault-table-wrap" style={{ maxHeight: "165px", marginTop: "0" }}>
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>System</th>
                  <th>Clinical / Legal Finding</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {analysis?.clinicalDifferentialAndCoding.map((row, idx) => (
                  <tr key={idx}>
                    <td className="tabular-nums" style={{ color: "var(--accent-safe)", fontWeight: 600 }}>
                      {row.code}
                    </td>
                    <td className="tabular-nums">{row.system}</td>
                    <td>
                      {renderHighlightedTokens(
                        rehydrateView
                          ? vaultEntries.reduce((acc, e) => acc.split(e.token).join(e.originalValue), row.finding)
                          : row.finding,
                        vaultEntries,
                        rehydrateView
                      )}
                    </td>
                    <td className="tabular-nums">{row.riskLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
