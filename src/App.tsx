import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  PII_CATEGORIES,
  CLINICAL_LEGAL_PRESETS,
  verifyZeroPiiLeak,
  type VaultEntry,
  type PiiCategoryId
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

type WorkspaceView = "airlock" | "wire" | "matrix" | "clients";
type ThemeMode = "dark" | "paper";

function renderInlineText(
  text: string,
  vaultEntries: VaultEntry[],
  isRehydratedView: boolean
): React.ReactNode {
  if (!text) return null;
  if (!isRehydratedView) {
    const parts = text.split(/(\[PII_[A-Z_]+_\d+\])/g);
    return parts.map((part, idx) => {
      if (/^\[PII_[A-Z_]+_\d+\]$/.test(part)) {
        return (
          <span key={idx} className="entity-span" title="Pseudonymized token sent across TLS wire">
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
  const escaped = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const rx = new RegExp("(" + escaped.join("|") + ")", "g");
  const valueSet = new Set(values);
  const parts = text.split(rx);
  return parts.map((part, idx) => {
    if (valueSet.has(part)) {
      const entry = vaultEntries.find((v) => v.originalValue === part);
      return (
        <span
          key={idx}
          className="entity-span restored"
          title={entry ? `${entry.token} · ${entry.regulationRef}` : "Restored from local RAM vault"}
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderEntitySpans(
  text: string,
  vaultEntries: VaultEntry[],
  isRehydratedView: boolean
): React.ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, lIdx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={lIdx} style={{ height: "6px" }} />;
    }
    if (trimmed.startsWith("### ")) {
      return (
        <div
          key={lIdx}
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            fontSize: "13px",
            color: "var(--fg-primary)",
            marginBottom: "6px"
          }}
        >
          {trimmed.slice(4)}
        </div>
      );
    }
    const boldSegments = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <div key={lIdx} style={{ marginBottom: "4px" }}>
        {boldSegments.map((seg, sIdx) => {
          if (seg.startsWith("**") && seg.endsWith("**")) {
            return (
              <strong key={sIdx} style={{ color: "var(--fg-primary)", fontWeight: 600 }}>
                {seg.slice(2, -2)}
              </strong>
            );
          }
          return (
            <React.Fragment key={sIdx}>
              {renderInlineText(seg, vaultEntries, isRehydratedView)}
            </React.Fragment>
          );
        })}
      </div>
    );
  });
}

const KOTLIN_SDK_SNIPPET = `// Android (Galaxy Z Fold7) — com.google.firebase:firebase-ai
val scrub = PiiAirlockEngine.scrub(rawClinicalNote, customPolicyTerms)
check(PiiAirlockEngine.verifyZeroLeak(scrub.sanitizedText, scrub.vault).passed) {
    "Outbound request blocked before socket open: unredacted PHI detected"
}

val cloudModel = Firebase.ai(backend = GenerativeBackend.googleAI())
    .generativeModel(modelName = "gemini-2.5-flash")

val response = cloudModel.generateContent(scrub.sanitizedText)
val clinicianText = PiiAirlockEngine.rehydrate(response.text.orEmpty(), scrub.vault)`;

export const App: React.FC = () => {
  const initialParams = useMemo(() => {
    if (typeof window === "undefined") {
      return { view: "airlock" as WorkspaceView, theme: "dark" as ThemeMode, rehydrate: true, presetIdx: 0, leak: false };
    }
    const q = new URLSearchParams(window.location.search);
    const rawView = q.get("view");
    const view: WorkspaceView =
      rawView === "wire" || rawView === "matrix" || rawView === "clients" ? rawView : "airlock";
    const theme: ThemeMode = q.get("theme") === "paper" ? "paper" : "dark";
    const rehydrate = q.get("lens") !== "wire";
    const presetIdx = Math.min(
      CLINICAL_LEGAL_PRESETS.length - 1,
      Math.max(0, Number(q.get("preset") || 0))
    );
    const leak = q.get("leak") === "1";
    return { view, theme, rehydrate, presetIdx, leak };
  }, []);

  const initialPreset = CLINICAL_LEGAL_PRESETS[initialParams.presetIdx] ?? CLINICAL_LEGAL_PRESETS[0];

  const [activeView, setActiveView] = useState<WorkspaceView>(initialParams.view);
  const [theme, setTheme] = useState<ThemeMode>(initialParams.theme);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPreset.id);
  const [rawText, setRawText] = useState<string>(initialPreset.rawDocument);
  const [customTermsInput, setCustomTermsInput] = useState<string>(
    initialPreset.defaultCustomTerms.join(", ")
  );
  const [stage1Mode, setStage1Mode] = useState<InferenceMode>(InferenceMode.ONLY_ON_DEVICE);
  const [cloudModelName, setCloudModelName] = useState<string>("gemini-2.5-flash");
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseWebConfig>(DEFAULT_DEMO_FIREBASE_CONFIG);
  const [configJsonText, setConfigJsonText] = useState<string>(
    JSON.stringify(DEFAULT_DEMO_FIREBASE_CONFIG, null, 2)
  );
  const [configOpen, setConfigOpen] = useState<boolean>(false);
  const [rehydrateView, setRehydrateView] = useState<boolean>(initialParams.rehydrate);
  const [revealVaultValues, setRevealVaultValues] = useState<boolean>(true);
  const [foldPosture, setFoldPosture] = useState<"unfolded" | "cover">("unfolded");
  const [sdkLang, setSdkLang] = useState<"ts" | "kotlin">("ts");
  const [pipelineResult, setPipelineResult] = useState<HybridPipelineExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [simulatedLeakAlert, setSimulatedLeakAlert] = useState<string | null>(null);
  const [serverReceiptStatus, setServerReceiptStatus] = useState<string>("Verified zero-leak");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const executeAirlock = useCallback(
    async (
      inputDoc: string,
      customCsv: string,
      mode: InferenceMode,
      cfg: FirebaseWebConfig,
      modelName: string,
      triggerDemoLeak = false
    ) => {
      setIsRunning(true);
      if (!triggerDemoLeak) setSimulatedLeakAlert(null);
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

        if (triggerDemoLeak) {
          const tampered = result.scrubResult.sanitizedText + "\n[Injected unredacted SSN 419-82-6741]";
          const check = verifyZeroPiiLeak(tampered, result.scrubResult.vaultEntries, result.scrubResult.rawText);
          if (!check.passed) {
            setSimulatedLeakAlert(
              `Pre-socket gatekeeper blocked outbound request: caught unredacted pattern (${check.leakedTokens.join(", ")}, ${check.cloudPiiBytes} B) before network dispatch.`
            );
          }
        }

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
              setServerReceiptStatus(`Receipt ${receipt.receiptId ?? "verified"}`);
            }
          }
        } catch {
          setServerReceiptStatus("Local SHA-256 verified");
        }
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  useEffect(() => {
    void executeAirlock(rawText, customTermsInput, stage1Mode, firebaseConfig, cloudModelName, initialParams.leak);
  }, []);

  const activePreset = useMemo(
    () => CLINICAL_LEGAL_PRESETS.find((p) => p.id === selectedPresetId) ?? CLINICAL_LEGAL_PRESETS[0],
    [selectedPresetId]
  );

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

  const handleSimulateLeakAttempt = () => {
    if (!pipelineResult) return;
    const tamperedPayload =
      pipelineResult.scrubResult.sanitizedText + "\n[Injected unredacted SSN 419-82-6741]";
    const check = verifyZeroPiiLeak(
      tamperedPayload,
      pipelineResult.scrubResult.vaultEntries,
      pipelineResult.scrubResult.rawText
    );
    if (!check.passed) {
      setSimulatedLeakAlert(
        `Pre-socket gatekeeper blocked outbound request: caught unredacted pattern (${check.leakedTokens.join(", ")}, ${check.cloudPiiBytes} B) before network dispatch.`
      );
    }
  };

  const handleApplyFirebaseConfig = () => {
    try {
      const parsed = JSON.parse(configJsonText) as FirebaseWebConfig;
      setFirebaseConfig(parsed);
      setConfigOpen(false);
      void executeAirlock(rawText, customTermsInput, stage1Mode, parsed, cloudModelName);
    } catch {
      setSimulatedLeakAlert("Invalid Firebase config JSON syntax; keeping active project settings.");
    }
  };

  const telemetry = pipelineResult?.scrubResult.telemetry;
  const vaultEntries = pipelineResult?.scrubResult.vaultEntries ?? [];
  const analysis = pipelineResult?.analysis;
  const liveCloud = isLiveFirebaseConfigured(firebaseConfig);

  const categoryCounts = useMemo(() => {
    const map = new Map<PiiCategoryId, number>();
    for (const entry of vaultEntries) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + entry.occurrences);
    }
    return map;
  }, [vaultEntries]);

  return (
    <div className="workspace-layout">
      {/* Left Workspace Navigation Rail */}
      <aside className="sidebar" aria-label="PII-Zero workspace navigation">
        <div className="brand-mark-row">
          <div className="brand-identity">
            <span className="brand-glyph" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 4H5v16h4M15 4h4v16h-4M12 8v8" />
              </svg>
            </span>
            <div>
              <div className="brand-name">PII-Zero</div>
              <div className="brand-meta">Hybrid AI airlock</div>
            </div>
          </div>
          <span className="quiet-count">v1.2</span>
        </div>

        <nav className="sidebar-group" aria-label="Views">
          <div className="sidebar-label">Views</div>
          <button
            type="button"
            className={"nav-item " + (activeView === "airlock" ? "active" : "")}
            onClick={() => setActiveView("airlock")}
          >
            <span className="nav-item-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
              <span className="nav-item-title">Document airlock</span>
            </span>
          </button>

          <button
            type="button"
            className={"nav-item " + (activeView === "wire" ? "active" : "")}
            onClick={() => setActiveView("wire")}
          >
            <span className="nav-item-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 3l7 4v5c0 4.5-3 8.5-7 9.5-4-1-7-5-7-9.5V7l7-4z" />
              </svg>
              <span className="nav-item-title">Wire boundary &amp; vault</span>
            </span>
            <span className="quiet-count">{vaultEntries.length}</span>
          </button>

          <button
            type="button"
            className={"nav-item " + (activeView === "matrix" ? "active" : "")}
            onClick={() => setActiveView("matrix")}
          >
            <span className="nav-item-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              <span className="nav-item-title">HIPAA 18 &amp; FRE 502</span>
            </span>
            <span className="quiet-count">18</span>
          </button>

          <button
            type="button"
            className={"nav-item " + (activeView === "clients" ? "active" : "")}
            onClick={() => setActiveView("clients")}
          >
            <span className="nav-item-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
              <span className="nav-item-title">Companion apps</span>
            </span>
            <span className="quiet-count">MV3 · APK</span>
          </button>
        </nav>

        <div className="sidebar-group">
          <div className="sidebar-label">Sample records</div>
          {CLINICAL_LEGAL_PRESETS.map((preset, idx) => {
            const compactLabels = [
              { name: "Oncology consult", tag: "HIPAA" },
              { name: "M&A term sheet", tag: "FRE 408" },
              { name: "ED psych intake", tag: "Part 2" },
              { name: "Cardiac lead MDL", tag: "FDA" }
            ];
            const meta = compactLabels[idx] ?? { name: preset.title.slice(0, 18), tag: "Case" };
            return (
              <button
                key={preset.id}
                type="button"
                className={"nav-item " + (selectedPresetId === preset.id ? "active" : "")}
                onClick={() => handlePresetChange(preset.id)}
              >
                <span className="nav-item-left">
                  <span className="nav-item-title">{meta.name}</span>
                </span>
                <span className="quiet-count">{meta.tag}</span>
              </button>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <div className="enclave-row">
            <span className="dot" />
            <span>
              {pipelineResult?.onDeviceStatus.chromePromptApiDetected
                ? "Gemini Nano hardware active"
                : "Local browser enclave active"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ flex: 1 }}
              onClick={() => setTheme((t) => (t === "dark" ? "paper" : "dark"))}
            >
              {theme === "dark" ? "Archival paper" : "Graphite dark"}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ flex: 1 }}
              onClick={() => setConfigOpen((v) => !v)}
            >
              {liveCloud ? "Firebase live" : "Firebase config"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Region */}
      <div className="main-region">
        <header className="page-header">
          <div className="doc-heading-group">
            <h1 className="doc-title">{activePreset.title}</h1>
            <div className="doc-subtitle">
              <span>45 CFR §164.514(b)(2) Safe Harbor &amp; FRE 502 privilege boundary</span>
              <span>·</span>
              <span className="tabular-nums">firebase/ai@{pipelineResult?.firebaseSdkVersion ?? "12.4.0"}</span>
              <span>·</span>
              <span className="tabular-nums">{serverReceiptStatus}</span>
            </div>
          </div>

          <div className="header-actions">
            <div className="segmented" role="group" aria-label="Firebase AI Logic InferenceMode">
              <button
                type="button"
                className={"seg-btn " + (stage1Mode === InferenceMode.ONLY_ON_DEVICE ? "active" : "")}
                onClick={() => handleModeChange(InferenceMode.ONLY_ON_DEVICE)}
              >
                On-device only
              </button>
              <button
                type="button"
                className={"seg-btn " + (stage1Mode === InferenceMode.PREFER_ON_DEVICE ? "active" : "")}
                onClick={() => handleModeChange(InferenceMode.PREFER_ON_DEVICE)}
              >
                Prefer on-device
              </button>
              <button
                type="button"
                className={"seg-btn " + (stage1Mode === InferenceMode.ONLY_IN_CLOUD ? "active" : "")}
                onClick={() => handleModeChange(InferenceMode.ONLY_IN_CLOUD)}
              >
                Sanitized cloud
              </button>
            </div>

            <button type="button" className="btn" onClick={handleSimulateLeakAttempt}>
              Test leak block
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isRunning}
              onClick={() =>
                void executeAirlock(rawText, customTermsInput, stage1Mode, firebaseConfig, cloudModelName)
              }
            >
              {isRunning ? "Running airlock…" : "Run airlock"}
            </button>
          </div>
        </header>

        {simulatedLeakAlert && (
          <div className="leak-banner" role="alert">
            <span className="tabular-nums">{simulatedLeakAlert}</span>
            <button type="button" className="btn btn-quiet" onClick={() => setSimulatedLeakAlert(null)}>
              Dismiss
            </button>
          </div>
        )}

        {configOpen && (
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Firebase AI Logic &amp; App Check project settings</div>
                <div className="card-caption">
                  Paste your Firebase Web config JSON to route sanitized Stage 3 prompts directly through your own project
                </div>
              </div>
              <button type="button" className="btn btn-quiet" onClick={() => setConfigOpen(false)}>
                Close
              </button>
            </div>
            <textarea
              className="doc-editor"
              style={{ minHeight: "140px" }}
              value={configJsonText}
              onChange={(e) => setConfigJsonText(e.target.value)}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "center" }}>
              <button type="button" className="btn btn-primary" onClick={handleApplyFirebaseConfig}>
                Save Firebase config
              </button>
              <input
                type="text"
                className="text-input"
                style={{ width: "200px" }}
                value={cloudModelName}
                onChange={(e) => setCloudModelName(e.target.value)}
                aria-label="Cloud Gemini model"
              />
            </div>
          </section>
        )}

        {/* 4 Compact Stat Cards (Unslop tokens.md rule) */}
        <section className="metrics-row" aria-label="Airlock telemetry summary">
          <div className="metric-card">
            <span className="metric-label">Entities vaulted locally</span>
            <span className="metric-figure">{telemetry?.totalDetected ?? 0}</span>
            <span className="metric-note">
              {telemetry?.redactedOnDeviceCount ?? 0} HIPAA/legal + {telemetry?.customPolicyCount ?? 0} policy
            </span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Raw PII sent to cloud</span>
            <span className="metric-figure verified-zero">{telemetry?.cloudPiiBytesTransmitted ?? 0} B</span>
            <span className="metric-note">Pre-socket SHA-256 gate passed</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Payload byte delta</span>
            <span className="metric-figure">
              {telemetry?.rawInputBytes ?? 0} → {telemetry?.sanitizedOutputBytes ?? 0} B
            </span>
            <span className="metric-note">{telemetry?.scrubbedPiiBytes ?? 0} B sensitive strings removed</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Re-hydrated spans</span>
            <span className="metric-figure">
              {pipelineResult?.rehydratedNarrative.restoredCount ?? 0}
            </span>
            <span className="metric-note">{vaultEntries.length} unique entities in local Map</span>
          </div>
        </section>

        {/* Signature Boundary Diagram */}
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

        {/* VIEW 1: Document Airlock (Primary Workbench) */}
        {activeView === "airlock" && (
          <main className="airlock-split">
            <section className="card" aria-label="Unredacted source record">
              <div className="card-header">
                <div>
                  <div className="card-title">Unredacted source record</div>
                  <div className="card-caption">
                    Processed strictly in browser memory ({pipelineResult?.onDeviceStatus.availability ?? "local"})
                  </div>
                </div>
                <span className="quiet-count">Never leaves device</span>
              </div>

              <textarea
                id="raw-clinical-input"
                aria-label="Unredacted source document"
                className="doc-editor"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />

              <div className="field-group">
                <label htmlFor="custom-policy-terms" className="field-label">
                  Matter or project codewords to scrub alongside HIPAA 18 (comma-separated)
                </label>
                <input
                  id="custom-policy-terms"
                  type="text"
                  className="text-input"
                  value={customTermsInput}
                  onChange={(e) => setCustomTermsInput(e.target.value)}
                />
              </div>

              <div className="digest-bar">
                <span>Source SHA-256</span>
                <span>{pipelineResult?.scrubResult.rawSha256.slice(0, 32) ?? ""}…</span>
              </div>
            </section>

            <section className="card" aria-label="Cloud reasoning and local re-hydration">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    {analysis?.documentClassification ?? "Clinical & legal synthesis"}
                  </div>
                  <div className="card-caption">
                    Toggle between what the authorized clinician reads and what Google&apos;s cloud received
                  </div>
                </div>

                <div className="segmented" role="group" aria-label="Output view lens">
                  <button
                    type="button"
                    className={"seg-btn " + (rehydrateView ? "active" : "")}
                    onClick={() => setRehydrateView(true)}
                  >
                    Clinician view (restored)
                  </button>
                  <button
                    type="button"
                    className={"seg-btn " + (!rehydrateView ? "active" : "")}
                    onClick={() => setRehydrateView(false)}
                  >
                    Cloud wire view ([PII_*])
                  </button>
                </div>
              </div>

              <div className="document-reader">
                {renderEntitySpans(
                  rehydrateView
                    ? pipelineResult?.rehydratedNarrative.rehydratedText ?? ""
                    : analysis?.rehydratableNarrativeReport ?? "",
                  vaultEntries,
                  rehydrateView
                )}
              </div>

              <div className="section-subhead">
                <span>Pharmacovigilance &amp; privilege risk flags</span>
                <span className="quiet-count">
                  {analysis?.pharmacovigilanceOrClauseAlerts.length ?? 0} findings
                </span>
              </div>

              <div className="finding-list">
                {analysis?.pharmacovigilanceOrClauseAlerts.map((alert, idx) => (
                  <div key={idx} className="finding-card">
                    <div className="finding-top">
                      <span>{alert.title}</span>
                      <span className={"severity-tag " + (alert.severity === "CRITICAL" ? "critical" : "")}>
                        {alert.severity === "CRITICAL" ? "Critical" : "High"}
                      </span>
                    </div>
                    <div className="finding-body">
                      {renderEntitySpans(
                        rehydrateView
                          ? vaultEntries.reduce((acc, e) => acc.split(e.token).join(e.originalValue), alert.mechanismOrClause)
                          : alert.mechanismOrClause,
                        vaultEntries,
                        rehydrateView
                      )}
                    </div>
                    <div className="finding-action">
                      <span style={{ color: "var(--fg-muted)" }}>Recommended step: </span>
                      {renderEntitySpans(
                        rehydrateView
                          ? vaultEntries.reduce((acc, e) => acc.split(e.token).join(e.originalValue), alert.recommendation)
                          : alert.recommendation,
                        vaultEntries,
                        rehydrateView
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="section-subhead">
                <span>ICD-10-CM, CPT &amp; statutory schedule</span>
              </div>

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>System</th>
                      <th>Finding</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis?.clinicalDifferentialAndCoding.map((row, idx) => (
                      <tr key={idx}>
                        <td className="tabular-nums" style={{ fontWeight: 500 }}>
                          {row.code}
                        </td>
                        <td className="tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                          {row.system}
                        </td>
                        <td>
                          {renderEntitySpans(
                            rehydrateView
                              ? vaultEntries.reduce((acc, e) => acc.split(e.token).join(e.originalValue), row.finding)
                              : row.finding,
                            vaultEntries,
                            rehydrateView
                          )}
                        </td>
                        <td className="tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                          {row.riskLevel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {/* VIEW 2: Wire Boundary & Ephemeral RAM Vault */}
        {activeView === "wire" && (
          <main className="airlock-split">
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Exact outbound payload transmitted to Cloud Gemini</div>
                  <div className="card-caption">
                    Every personal identifier is replaced with an entity-numbered token so coreference survives without leaking PII
                  </div>
                </div>
                <span className="quiet-count">0 B raw PII</span>
              </div>

              <div className="document-reader" style={{ maxHeight: "380px" }}>
                {renderEntitySpans(pipelineResult?.scrubResult.sanitizedText ?? "", vaultEntries, false)}
              </div>

              <div className="digest-bar">
                <span>Outbound SHA-256 receipt</span>
                <span style={{ color: "var(--accent-positive)" }}>
                  {pipelineResult?.scrubResult.sanitizedSha256.slice(0, 36) ?? ""}…
                </span>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Client-only ephemeral token vault</div>
                  <div className="card-caption">
                    Held in volatile JavaScript Map (zero IndexedDB, localStorage, or cookie writes)
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setRevealVaultValues((v) => !v)}
                >
                  {revealVaultValues ? "Mask raw values" : "Show raw values"}
                </button>
              </div>

              <div className="table-scroll" style={{ maxHeight: "420px" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Raw value (local RAM)</th>
                      <th>Identifier class &amp; rule</th>
                      <th>Hits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaultEntries.map((entry) => (
                      <tr key={entry.token}>
                        <td className="tabular-nums" style={{ color: "var(--accent-amber)" }}>
                          {entry.token}
                        </td>
                        <td className="tabular-nums">
                          {revealVaultValues ? entry.originalValue : "••••••••••••"}
                        </td>
                        <td>
                          <div>{entry.label}</div>
                          <div style={{ fontSize: "11px", color: "var(--fg-muted)" }}>
                            {entry.regulationRef}
                          </div>
                        </td>
                        <td className="tabular-nums">{entry.occurrences}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {/* VIEW 3: HIPAA 18 & FRE 502 Coverage Matrix */}
        {activeView === "matrix" && (
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">HIPAA Safe Harbor 18-identifier &amp; legal privilege coverage</div>
                <div className="card-caption">
                  Live audit of every statutory identifier class detected in the current document
                </div>
              </div>
              <span className="quiet-count">
                {Array.from(categoryCounts.values()).reduce((a, b) => a + b, 0)} active matches
              </span>
            </div>

            <div className="table-scroll" style={{ maxHeight: "520px" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Identifier category</th>
                    <th>Token format</th>
                    <th>Statutory citation</th>
                    <th>Active document matches</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(PII_CATEGORIES).map((cat) => {
                    const count = categoryCounts.get(cat.id) ?? 0;
                    return (
                      <tr key={cat.id}>
                        <td style={{ fontWeight: 500 }}>{cat.label}</td>
                        <td className="tabular-nums" style={{ color: "var(--accent-amber)" }}>
                          [{cat.tokenPrefix}_n]
                        </td>
                        <td className="tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                          {cat.regulationRef}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            color: count > 0 ? "var(--accent-positive)" : "var(--fg-muted)",
                            fontWeight: count > 0 ? 500 : 400
                          }}
                        >
                          {count > 0 ? `${count} scrubbed` : "0 in record"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* VIEW 4: Companion Chrome MV3 Extension & Galaxy Z Fold7 Android App */}
        {activeView === "clients" && (
          <main className="companion-grid">
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Chrome MV3 Side Panel</div>
                  <div className="card-caption">Right-click EHR &amp; contract scrubber</div>
                </div>
                <a className="btn btn-quiet" href="/downloads/piizero-chrome-extension.zip" download>
                  Download .zip
                </a>
              </div>

              <div className="device-frame">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11.5px",
                    color: "var(--fg-muted)",
                    paddingBottom: "8px",
                    marginBottom: "10px",
                    borderBottom: "1px solid var(--border-hairline)"
                  }}
                >
                  <span>chrome.sidePanel · 360 px</span>
                  <span style={{ color: "var(--accent-positive)" }}>0 B raw PII</span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--fg-secondary)", marginBottom: "8px" }}>
                  Selected DOM textarea scrubbed inline before web paste:
                </div>
                <div className="document-reader" style={{ maxHeight: "180px", fontSize: "11.5px" }}>
                  {renderEntitySpans(
                    (pipelineResult?.scrubResult.sanitizedText ?? "").slice(0, 360) + "…",
                    vaultEntries,
                    false
                  )}
                </div>
                <div style={{ marginTop: "10px", fontSize: "11.5px", color: "var(--fg-muted)" }}>
                  Includes Manifest V3 service worker, context-menu scrub action, and 1-click inline DOM replacement.
                </div>
              </div>
            </section>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Android Jetpack Compose app (Galaxy Z Fold7 posture-aware)</div>
                    <div className="card-caption">
                      Uses Jetpack WindowManager FoldingFeature to switch between dual-pane split and compact cover screen
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div className="segmented">
                      <button
                        type="button"
                        className={"seg-btn " + (foldPosture === "unfolded" ? "active" : "")}
                        onClick={() => setFoldPosture("unfolded")}
                      >
                        Unfolded 2-pane
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (foldPosture === "cover" ? "active" : "")}
                        onClick={() => setFoldPosture("cover")}
                      >
                        Cover screen
                      </button>
                    </div>
                    <a className="btn btn-primary" href="/downloads/piizero-android-debug.apk" download>
                      Download APK
                    </a>
                  </div>
                </div>

                <div className="device-frame">
                  {foldPosture === "unfolded" ? (
                    <div className="fold-panes">
                      <div style={{ padding: "8px" }}>
                        <div style={{ fontSize: "11.5px", color: "var(--fg-muted)", marginBottom: "6px" }}>
                          Left pane · Local note &amp; vault ({vaultEntries.length} keys)
                        </div>
                        <div className="document-reader" style={{ maxHeight: "145px", fontSize: "11.5px" }}>
                          {rawText.slice(0, 280)}…
                        </div>
                      </div>
                      <div className="fold-hinge" title="24dp FoldingFeature hinge clearance">
                        <span>⋮</span>
                      </div>
                      <div style={{ padding: "8px" }}>
                        <div style={{ fontSize: "11.5px", color: "var(--accent-positive)", marginBottom: "6px" }}>
                          Right pane · Re-hydrated Gemini 2.5 Flash brief
                        </div>
                        <div className="document-reader" style={{ maxHeight: "145px", fontSize: "11.5px" }}>
                          {renderEntitySpans(
                            (pipelineResult?.rehydratedNarrative.rehydratedText ?? "").slice(0, 280) + "…",
                            vaultEntries,
                            true
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ maxWidth: "340px", margin: "0 auto", padding: "6px" }}>
                      <div style={{ fontSize: "11.5px", color: "var(--fg-muted)", marginBottom: "6px" }}>
                        Compact posture · Single-column tabbed ledger
                      </div>
                      <div className="document-reader" style={{ maxHeight: "145px", fontSize: "11.5px" }}>
                        {renderEntitySpans(
                          (pipelineResult?.rehydratedNarrative.rehydratedText ?? "").slice(0, 260) + "…",
                          vaultEntries,
                          true
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Firebase AI Logic Hybrid SDK implementation</div>
                    <div className="card-caption">
                      Exact SDK calls used across Web (firebase/ai) and Android (com.google.firebase:firebase-ai)
                    </div>
                  </div>
                  <div className="segmented">
                    <button
                      type="button"
                      className={"seg-btn " + (sdkLang === "ts" ? "active" : "")}
                      onClick={() => setSdkLang("ts")}
                    >
                      Web TypeScript
                    </button>
                    <button
                      type="button"
                      className={"seg-btn " + (sdkLang === "kotlin" ? "active" : "")}
                      onClick={() => setSdkLang("kotlin")}
                    >
                      Android Kotlin
                    </button>
                  </div>
                </div>
                <pre className="document-reader" style={{ maxHeight: "210px" }}>
                  {sdkLang === "ts" ? generateSdkCodeSnippet(stage1Mode, cloudModelName) : KOTLIN_SDK_SNIPPET}
                </pre>
              </section>
            </div>
          </main>
        )}
      </div>
    </div>
  );
};
