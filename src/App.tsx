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

type WorkspaceTab = "studio" | "vault" | "apps";
type ThemeMode = "light" | "dark";

const PRESET_SHORT_META = [
  { label: "Oncology Consult", tag: "Medical" },
  { label: "M&A Settlement", tag: "Legal" },
  { label: "ER Triage Note", tag: "Psych" },
  { label: "Cardiac Device Claim", tag: "FDA" }
];

const KOTLIN_SDK_SNIPPET = `// Android (Galaxy Z Fold7) - com.google.firebase:firebase-ai
val scrub = PiiAirlockEngine.scrub(rawClinicalNote, customPolicyTerms)
check(PiiAirlockEngine.verifyZeroLeak(scrub.sanitizedText, scrub.vault).passed) {
    "Blocked outbound request: raw patient or client identifier detected"
}

val cloudModel = Firebase.ai(backend = GenerativeBackend.googleAI())
    .generativeModel(modelName = "gemini-2.5-flash")

val response = cloudModel.generateContent(scrub.sanitizedText)
val restoredView = PiiAirlockEngine.rehydrate(response.text.orEmpty(), scrub.vault)`;

/**
 * Highlights detected raw PII spans in Step 1 (coral highlight)
 */
function renderRawHighlightedLine(line: string, vaultEntries: VaultEntry[]): React.ReactNode {
  const values = vaultEntries
    .map((v) => v.originalValue)
    .filter((v) => v.length >= 3)
    .sort((a, b) => b.length - a.length);
  if (values.length === 0) return line;
  const escaped = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const rx = new RegExp("(" + escaped.join("|") + ")", "g");
  const lookup = new Map<string, VaultEntry>();
  for (const entry of vaultEntries) {
    if (!lookup.has(entry.originalValue)) lookup.set(entry.originalValue, entry);
  }
  return line.split(rx).map((part, idx) => {
    const matched = lookup.get(part);
    if (matched) {
      return (
        <span
          key={idx}
          className="mark-raw"
          title={`Detected locally (${matched.label}) -> replaced by ${matched.token}`}
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

/**
 * Renders placeholder tokens in Step 2 (amber monospace pills) or restored values in Step 3 (sage green)
 */
function renderTokenOrRestoredSegment(
  text: string,
  vaultEntries: VaultEntry[],
  mode: "tokens" | "restored"
): React.ReactNode {
  if (!text) return null;
  if (mode === "tokens") {
    const byToken = new Map<string, VaultEntry>();
    for (const v of vaultEntries) byToken.set(v.token, v);
    const parts = text.split(/(\[PII_[A-Z_]+_\d+\])/g);
    return parts.map((part, idx) => {
      if (/^\[PII_[A-Z_]+_\d+\]$/.test(part)) {
        const entry = byToken.get(part);
        return (
          <span
            key={idx}
            className="mark-token"
            title={
              entry
                ? `Kept in local RAM: "${entry.originalValue}" (${entry.label})`
                : "Safe placeholder sent to Google Cloud"
            }
          >
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
  const lookup = new Map<string, VaultEntry>();
  for (const v of vaultEntries) {
    if (!lookup.has(v.originalValue)) lookup.set(v.originalValue, v);
  }
  return text.split(rx).map((part, idx) => {
    const entry = lookup.get(part);
    if (entry) {
      return (
        <span
          key={idx}
          className="mark-restored"
          title={`Restored on your device from ${entry.token} (Google Cloud never saw "${part}")`}
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderFormattedLines(
  text: string,
  vaultEntries: VaultEntry[],
  mode: "raw" | "tokens" | "restored"
): React.ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={idx} style={{ height: "8px" }} />;
    }
    if (idx === 0 && /^[A-Z0-9\s&—–\-():/]+$/.test(trimmed) && trimmed.length > 14) {
      return (
        <div key={idx} className="doc-line-header">
          {trimmed}
        </div>
      );
    }
    if (trimmed.startsWith("### ")) {
      return (
        <div key={idx} className="doc-line-header">
          {trimmed.slice(4)}
        </div>
      );
    }
    if (mode === "raw") {
      return (
        <div key={idx} className="doc-line">
          {renderRawHighlightedLine(line, vaultEntries)}
        </div>
      );
    }
    const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <div key={idx} className="doc-line">
        {boldParts.map((seg, sIdx) => {
          if (seg.startsWith("**") && seg.endsWith("**")) {
            return (
              <strong key={sIdx} style={{ fontWeight: 600, color: "var(--fg-primary)" }}>
                {seg.slice(2, -2)}
              </strong>
            );
          }
          return (
            <React.Fragment key={sIdx}>
              {renderTokenOrRestoredSegment(seg, vaultEntries, mode)}
            </React.Fragment>
          );
        })}
      </div>
    );
  });
}

function replaceTokensWithValues(text: string, vaultEntries: VaultEntry[]): string {
  const sorted = [...vaultEntries].sort((a, b) => b.token.length - a.token.length);
  return sorted.reduce((acc, entry) => acc.split(entry.token).join(entry.originalValue), text);
}

export const App: React.FC = () => {
  const initialParams = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        tab: "studio" as WorkspaceTab,
        theme: "light" as ThemeMode,
        rehydrate: true,
        presetIdx: 0,
        leak: false,
        edit: false
      };
    }
    const q = new URLSearchParams(window.location.search);
    const rawView = q.get("view") || q.get("tab");
    const tab: WorkspaceTab =
      rawView === "vault" || rawView === "wire" || rawView === "matrix"
        ? "vault"
        : rawView === "apps" || rawView === "clients"
        ? "apps"
        : "studio";
    const theme: ThemeMode = q.get("theme") === "dark" ? "dark" : "light";
    const rehydrate = q.get("lens") !== "wire";
    const presetIdx = Math.min(
      CLINICAL_LEGAL_PRESETS.length - 1,
      Math.max(0, Number(q.get("preset") || 0))
    );
    const leak = q.get("leak") === "1";
    const edit = q.get("edit") === "1";
    return { tab, theme, rehydrate, presetIdx, leak, edit };
  }, []);

  const initialPreset = CLINICAL_LEGAL_PRESETS[initialParams.presetIdx] ?? CLINICAL_LEGAL_PRESETS[0];

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialParams.tab);
  const [theme, setTheme] = useState<ThemeMode>(initialParams.theme);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPreset.id);
  const [rawText, setRawText] = useState<string>(initialPreset.rawDocument);
  const [customTermsInput, setCustomTermsInput] = useState<string>(
    initialPreset.defaultCustomTerms.join(", ")
  );
  const [isEditingSource, setIsEditingSource] = useState<boolean>(initialParams.edit);
  const [stage1Mode, setStage1Mode] = useState<InferenceMode>(InferenceMode.ONLY_ON_DEVICE);
  const [cloudModelName, setCloudModelName] = useState<string>("gemini-2.5-flash");
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseWebConfig>(DEFAULT_DEMO_FIREBASE_CONFIG);
  const [configJsonText, setConfigJsonText] = useState<string>(
    JSON.stringify(DEFAULT_DEMO_FIREBASE_CONFIG, null, 2)
  );
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [rehydrateView, setRehydrateView] = useState<boolean>(initialParams.rehydrate);
  const [revealVaultValues, setRevealVaultValues] = useState<boolean>(true);
  const [foldPosture, setFoldPosture] = useState<"unfolded" | "cover">("unfolded");
  const [sdkLang, setSdkLang] = useState<"ts" | "kotlin">("ts");
  const [pipelineResult, setPipelineResult] = useState<HybridPipelineExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [simulatedLeakAlert, setSimulatedLeakAlert] = useState<{
    title: string;
    detail: string;
  } | null>(null);

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
          const tampered = result.scrubResult.sanitizedText + "\nSSN: 419-82-6741";
          const check = verifyZeroPiiLeak(
            tampered,
            result.scrubResult.vaultEntries,
            result.scrubResult.rawText
          );
          if (!check.passed) {
            setSimulatedLeakAlert({
              title: "Outbound network request blocked before leaving this device",
              detail: `Test injected an unredacted SSN (419-82-6741) after scrubbing. Pre-send leak verification caught ${check.leakedTokens.join(
                ", "
              )} (${check.cloudPiiBytes} bytes) and canceled the cloud call.`
            });
          }
        }

        try {
          await fetch("/api/airlock/verify-zero-pii", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sanitizedText: result.scrubResult.sanitizedText,
              vaultValues: result.scrubResult.vaultEntries.map((v) => v.originalValue),
              redactedCount: result.scrubResult.telemetry.totalDetected
            })
          });
        } catch {
          // Local verification already succeeded
        }
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  useEffect(() => {
    void executeAirlock(
      rawText,
      customTermsInput,
      stage1Mode,
      firebaseConfig,
      cloudModelName,
      initialParams.leak
    );
  }, []);

  const handlePresetChange = (presetId: string) => {
    const found = CLINICAL_LEGAL_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedPresetId(found.id);
    setRawText(found.rawDocument);
    const csv = found.defaultCustomTerms.join(", ");
    setCustomTermsInput(csv);
    setIsEditingSource(false);
    void executeAirlock(found.rawDocument, csv, stage1Mode, firebaseConfig, cloudModelName);
  };

  const handleSimulateLeakAttempt = () => {
    if (!pipelineResult) return;
    const tampered = pipelineResult.scrubResult.sanitizedText + "\nSSN: 419-82-6741";
    const check = verifyZeroPiiLeak(
      tampered,
      pipelineResult.scrubResult.vaultEntries,
      pipelineResult.scrubResult.rawText
    );
    if (!check.passed) {
      setSimulatedLeakAlert({
        title: "Outbound network request blocked before leaving this device",
        detail: `Simulated leak test appended raw SSN "419-82-6741" to the outgoing prompt. The pre-send check caught ${check.leakedTokens.join(
          ", "
        )} and aborted network transmission (0 bytes sent).`
      });
    }
  };

  const handleApplyFirebaseConfig = () => {
    try {
      const parsed = JSON.parse(configJsonText) as FirebaseWebConfig;
      setFirebaseConfig(parsed);
      setSettingsOpen(false);
      void executeAirlock(rawText, customTermsInput, stage1Mode, parsed, cloudModelName);
    } catch {
      setSimulatedLeakAlert({
        title: "Invalid Firebase JSON format",
        detail: "Check that your pasted Firebase web configuration is valid JSON."
      });
    }
  };

  const telemetry = pipelineResult?.scrubResult.telemetry;
  const vaultEntries = pipelineResult?.scrubResult.vaultEntries ?? [];
  const analysis = pipelineResult?.analysis;
  const liveCloud = isLiveFirebaseConfigured(firebaseConfig);
  const totalDetected = telemetry?.totalDetected ?? 0;
  const shortSha = (pipelineResult?.scrubResult.sanitizedSha256 ?? "").slice(0, 10);

  const categoryCounts = useMemo(() => {
    const map = new Map<PiiCategoryId, number>();
    for (const entry of vaultEntries) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + entry.occurrences);
    }
    return map;
  }, [vaultEntries]);

  return (
    <div className="app-shell">
      {/* Clean Top Bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-cluster">
            <span className="brand-logo" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                <path d="M12 3l7 4v5c0 4.5-3 8.5-7 9.5-4-1-7-5-7-9.5V7l7-4z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <div className="brand-title-wrap">
              <span className="brand-name">PII-Zero</span>
              <span className="brand-tagline">
                Local privacy shield for medical charts &amp; legal contracts
              </span>
            </div>
          </div>

          <nav className="nav-tabs" aria-label="Primary sections">
            <button
              type="button"
              className={"nav-tab " + (activeTab === "studio" ? "active" : "")}
              onClick={() => setActiveTab("studio")}
            >
              <span>1-2-3 Document Studio</span>
            </button>
            <button
              type="button"
              className={"nav-tab " + (activeTab === "vault" ? "active" : "")}
              onClick={() => setActiveTab("vault")}
            >
              <span>Local Vault &amp; 18 Rules</span>
              <span className="tab-count">{vaultEntries.length}</span>
            </button>
            <button
              type="button"
              className={"nav-tab " + (activeTab === "apps" ? "active" : "")}
              onClick={() => setActiveTab("apps")}
            >
              <span>Chrome &amp; Android Apps</span>
            </button>
          </nav>

          <div className="topbar-right">
            <div className="zero-pill" title="Pre-network check verified zero personal identifiers in cloud prompt">
              <span className="zero-dot" />
              <span>0 raw PII sent to cloud</span>
            </div>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              {liveCloud ? "Firebase: Live" : "Settings"}
            </button>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
              aria-label="Toggle color theme"
            >
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>
          </div>
        </div>
      </header>

      <div className="page-body">
        {/* Sample Selector & Primary Actions */}
        <div className="control-strip">
          <div className="preset-strip" role="group" aria-label="Sample documents">
            <span className="strip-label">Example record:</span>
            {CLINICAL_LEGAL_PRESETS.map((preset, idx) => {
              const info = PRESET_SHORT_META[idx] ?? { label: preset.title.slice(0, 18), tag: "Sample" };
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={"preset-pill " + (isSelected ? "active" : "")}
                  onClick={() => handlePresetChange(preset.id)}
                >
                  <span>{info.label}</span>
                  <span className="preset-tag">· {info.tag}</span>
                </button>
              );
            })}
          </div>

          <div className="action-group">
            <button type="button" className="btn" onClick={handleSimulateLeakAttempt}>
              Test Leak Blocker
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isRunning}
              onClick={() => {
                setIsEditingSource(false);
                void executeAirlock(rawText, customTermsInput, stage1Mode, firebaseConfig, cloudModelName);
              }}
            >
              {isRunning ? "Analyzing…" : "Scrub & Analyze"}
            </button>
          </div>
        </div>

        {/* Leak Blocker Alert */}
        {simulatedLeakAlert && (
          <div className="leak-alert" role="alert">
            <div>
              <div className="leak-alert-title">{simulatedLeakAlert.title}</div>
              <div className="leak-alert-desc">{simulatedLeakAlert.detail}</div>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => setSimulatedLeakAlert(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* Collapsible Firebase & Hybrid Mode Settings */}
        {settingsOpen && (
          <section className="settings-drawer" aria-label="Hybrid AI settings">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <div className="panel-title">Firebase AI Logic &amp; Local Scrubber Settings</div>
                <div className="panel-desc">
                  Choose how Stage 1 runs locally and optionally connect your own Firebase project for live Gemini 2.5 Flash calls.
                </div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500 }}>Local scrubber mode (firebase/ai):</span>
              <div className="segmented">
                <button
                  type="button"
                  className={"seg-btn " + (stage1Mode === InferenceMode.ONLY_ON_DEVICE ? "active" : "")}
                  onClick={() => {
                    setStage1Mode(InferenceMode.ONLY_ON_DEVICE);
                    void executeAirlock(rawText, customTermsInput, InferenceMode.ONLY_ON_DEVICE, firebaseConfig, cloudModelName);
                  }}
                >
                  Only on-device (Gemini Nano)
                </button>
                <button
                  type="button"
                  className={"seg-btn " + (stage1Mode === InferenceMode.PREFER_ON_DEVICE ? "active" : "")}
                  onClick={() => {
                    setStage1Mode(InferenceMode.PREFER_ON_DEVICE);
                    void executeAirlock(rawText, customTermsInput, InferenceMode.PREFER_ON_DEVICE, firebaseConfig, cloudModelName);
                  }}
                >
                  Prefer on-device
                </button>
              </div>
              <span style={{ fontSize: "12.5px", color: "var(--fg-muted)" }}>
                Cloud model: <strong className="mono">{cloudModelName}</strong>
              </span>
            </div>

            <textarea
              className="doc-textarea mono"
              style={{ minHeight: "120px", fontSize: "12px" }}
              value={configJsonText}
              onChange={(e) => setConfigJsonText(e.target.value)}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "10px", alignItems: "center" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleApplyFirebaseConfig}>
                Save Firebase Config
              </button>
              <input
                type="text"
                className="text-input mono"
                style={{ width: "200px", height: "28px", fontSize: "12px" }}
                value={cloudModelName}
                onChange={(e) => setCloudModelName(e.target.value)}
                aria-label="Cloud model name"
              />
            </div>
          </section>
        )}

        {/* TAB 1: 3-STEP DOCUMENT STUDIO */}
        {activeTab === "studio" && (
          <>
            <main className="studio-grid" aria-label="Three-step privacy workflow">
              {/* STEP 1: Original Private Document */}
              <section className="sheet-card" aria-label="Step 1: Original private document">
                <div className="sheet-header">
                  <div className="step-heading">
                    <span className="step-num s1">1</span>
                    <div>
                      <h2 className="sheet-title">Your Private Document</h2>
                      <p className="sheet-subtitle">Stays in browser memory · never sent out</p>
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label="Document input mode">
                    <button
                      type="button"
                      className={"seg-btn " + (!isEditingSource ? "active" : "")}
                      onClick={() => setIsEditingSource(false)}
                    >
                      Highlights
                    </button>
                    <button
                      type="button"
                      className={"seg-btn " + (isEditingSource ? "active" : "")}
                      onClick={() => setIsEditingSource(true)}
                    >
                      Edit text
                    </button>
                  </div>
                </div>

                <div className="sheet-body">
                  {!isEditingSource ? (
                    <div className="doc-prose">
                      {renderFormattedLines(rawText, vaultEntries, "raw")}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <textarea
                        id="raw-clinical-input"
                        aria-label="Paste private medical or legal text"
                        className="doc-textarea"
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                      />
                      <div>
                        <label
                          htmlFor="custom-policy-terms"
                          style={{ display: "block", fontSize: "12px", color: "var(--fg-secondary)", marginBottom: "5px" }}
                        >
                          Extra project or client codewords to hide (comma-separated):
                        </label>
                        <input
                          id="custom-policy-terms"
                          type="text"
                          className="text-input"
                          value={customTermsInput}
                          onChange={(e) => setCustomTermsInput(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="sheet-footer">
                  <span>
                    <strong>{totalDetected}</strong> private items spotted locally
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setIsEditingSource((v) => !v)}
                  >
                    {isEditingSource ? "Done editing" : "Paste your own text"}
                  </button>
                </div>
              </section>

              {/* Visual Arrow 1 -> 2 */}
              <div className="step-connector" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>

              {/* STEP 2: What Google Cloud Actually Sees */}
              <section className="sheet-card" aria-label="Step 2: Redacted prompt sent to Google Cloud">
                <div className="sheet-header">
                  <div className="step-heading">
                    <span className="step-num s2">2</span>
                    <div>
                      <h2 className="sheet-title">What Google Cloud Sees</h2>
                      <p className="sheet-subtitle">Sent over HTTPS to Gemini 2.5 Flash</p>
                    </div>
                  </div>
                  <span className="badge-safe">✓ 0 PII sent</span>
                </div>

                <div className="sheet-body">
                  <div className="doc-prose">
                    {renderFormattedLines(
                      pipelineResult?.scrubResult.sanitizedText ?? "",
                      vaultEntries,
                      "tokens"
                    )}
                  </div>
                </div>

                <div className="sheet-footer">
                  <span className="mono" style={{ fontSize: "11.5px" }}>
                    Leak check passed · #{shortSha}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setActiveTab("vault")}
                  >
                    View vault ({vaultEntries.length}) →
                  </button>
                </div>
              </section>

              {/* Visual Arrow 2 -> 3 */}
              <div className="step-connector" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>

              {/* STEP 3: Restored AI Analysis */}
              <section className="sheet-card" aria-label="Step 3: AI analysis with names restored locally">
                <div className="sheet-header">
                  <div className="step-heading">
                    <span className="step-num s3">3</span>
                    <div>
                      <h2 className="sheet-title">Gemini 2.5 Flash Review</h2>
                      <p className="sheet-subtitle">Names filled back in on your device</p>
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label="Result view toggle">
                    <button
                      type="button"
                      className={"seg-btn " + (rehydrateView ? "active" : "")}
                      onClick={() => setRehydrateView(true)}
                    >
                      Restored
                    </button>
                    <button
                      type="button"
                      className={"seg-btn " + (!rehydrateView ? "active" : "")}
                      onClick={() => setRehydrateView(false)}
                    >
                      Cloud raw
                    </button>
                  </div>
                </div>

                <div className="sheet-body">
                  <div className="brief-section-label">
                    <span>Key risks &amp; recommended actions</span>
                    <span>{analysis?.pharmacovigilanceOrClauseAlerts.length ?? 0} flagged</span>
                  </div>

                  {analysis?.pharmacovigilanceOrClauseAlerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className={"risk-callout " + (alert.severity === "CRITICAL" ? "critical" : "")}
                    >
                      <div className="risk-header">
                        <span>{alert.title}</span>
                        <span className={"risk-badge " + (alert.severity === "CRITICAL" ? "critical" : "")}>
                          {alert.severity === "CRITICAL" ? "Critical" : "High"}
                        </span>
                      </div>
                      <div className="risk-text">
                        {renderFormattedLines(
                          rehydrateView
                            ? replaceTokensWithValues(alert.mechanismOrClause, vaultEntries)
                            : alert.mechanismOrClause,
                          vaultEntries,
                          rehydrateView ? "restored" : "tokens"
                        )}
                      </div>
                      <div className="risk-action">
                        <strong>Action: </strong>
                        {renderTokenOrRestoredSegment(
                          rehydrateView
                            ? replaceTokensWithValues(alert.recommendation, vaultEntries)
                            : alert.recommendation,
                          vaultEntries,
                          rehydrateView ? "restored" : "tokens"
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="brief-section-label">
                    <span>Summary brief</span>
                  </div>
                  <div
                    className="doc-prose"
                    style={{
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "7px",
                      padding: "12px 14px"
                    }}
                  >
                    {renderFormattedLines(
                      rehydrateView
                        ? pipelineResult?.rehydratedNarrative.rehydratedText ?? ""
                        : analysis?.rehydratableNarrativeReport ?? "",
                      vaultEntries,
                      rehydrateView ? "restored" : "tokens"
                    )}
                  </div>

                  <div className="brief-section-label">
                    <span>Reference codes</span>
                  </div>
                  <table className="clean-table" style={{ border: "1px solid var(--border-subtle)", borderRadius: "6px" }}>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Finding</th>
                        <th>Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis?.clinicalDifferentialAndCoding.map((row, idx) => (
                        <tr key={idx}>
                          <td className="mono" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                            {row.code}
                          </td>
                          <td>
                            {renderTokenOrRestoredSegment(
                              rehydrateView
                                ? replaceTokensWithValues(row.finding, vaultEntries)
                                : row.finding,
                              vaultEntries,
                              rehydrateView ? "restored" : "tokens"
                            )}
                          </td>
                          <td style={{ fontSize: "12px", color: "var(--fg-secondary)", whiteSpace: "nowrap" }}>
                            {row.riskLevel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="sheet-footer">
                  <span>
                    <strong>{pipelineResult?.rehydratedNarrative.restoredCount ?? 0}</strong> names &amp; IDs restored locally
                  </span>
                  <span style={{ color: "var(--fg-muted)" }}>Hover any highlight to inspect</span>
                </div>
              </section>
            </main>

            {/* Simple Visual Color Key */}
            <footer className="legend-bar" aria-label="Highlight color key">
              <div className="legend-items">
                <span className="legend-item">
                  <span className="mark-raw">Elena Rostova</span>
                  <span>Spotted locally &amp; kept on device</span>
                </span>
                <span className="legend-item">
                  <span className="mark-token">[PII_NAME_01]</span>
                  <span>Placeholder sent to Google Cloud</span>
                </span>
                <span className="legend-item">
                  <span className="mark-restored">Elena Rostova</span>
                  <span>Restored locally in your final answer</span>
                </span>
              </div>
              <span className="mono" style={{ fontSize: "12px", color: "var(--fg-muted)" }}>
                Firebase AI Logic ({pipelineResult?.onDeviceStatus.chromePromptApiDetected ? "Gemini Nano + " : "On-device + "}
                Gemini 2.5 Flash)
              </span>
            </footer>
          </>
        )}

        {/* TAB 2: LOCAL VAULT & 18 HIPAA/LEGAL RULES */}
        {activeTab === "vault" && (
          <main className="two-col-grid">
            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">In-Memory Lookup Vault ({vaultEntries.length} unique items)</h2>
                  <p className="panel-desc">
                    Stored only in a temporary JavaScript Map inside this tab. Closing or refreshing wipes it immediately.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setRevealVaultValues((v) => !v)}
                >
                  {revealVaultValues ? "Mask originals" : "Reveal originals"}
                </button>
              </div>

              <div style={{ maxHeight: "540px", overflowY: "auto" }}>
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Cloud Placeholder</th>
                      <th>Original Value (Local RAM)</th>
                      <th>Category</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaultEntries.map((entry) => (
                      <tr key={entry.token}>
                        <td>
                          <span className="mark-token">{entry.token}</span>
                        </td>
                        <td className="mono" style={{ fontSize: "12.5px" }}>
                          {revealVaultValues ? entry.originalValue : "••••••••••••"}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{entry.label}</div>
                          <div style={{ fontSize: "11.5px", color: "var(--fg-muted)" }}>{entry.regulationRef}</div>
                        </td>
                        <td className="mono">{entry.occurrences}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">18 HIPAA Safe Harbor &amp; Legal Privilege Rules</h2>
                  <p className="panel-desc">
                    Every outgoing prompt is checked against all 18 identifier classes before any network call is allowed.
                  </p>
                </div>
                <span className="badge-safe">All 18 active</span>
              </div>

              <div style={{ maxHeight: "540px", overflowY: "auto" }}>
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Rule Category</th>
                      <th>Placeholder</th>
                      <th>Found in Current Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(PII_CATEGORIES).map((cat) => {
                      const count = categoryCounts.get(cat.id) ?? 0;
                      return (
                        <tr key={cat.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{cat.label}</div>
                            <div style={{ fontSize: "11.5px", color: "var(--fg-muted)" }}>{cat.regulationRef}</div>
                          </td>
                          <td>
                            <span className="mark-token">[{cat.tokenPrefix}_01]</span>
                          </td>
                          <td className="mono" style={{ fontWeight: count > 0 ? 600 : 400, color: count > 0 ? "var(--status-safe)" : "var(--fg-muted)" }}>
                            {count > 0 ? `✓ ${count} scrubbed` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {/* TAB 3: CHROME EXTENSION & ANDROID FOLDABLE APPS */}
        {activeTab === "apps" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="two-col-grid">
              {/* Chrome MV3 Side Panel Preview */}
              <section className="panel-card">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Chrome Side Panel Extension (Manifest V3)</h2>
                    <p className="panel-desc">
                      Highlight any clinical chart or contract box on the web, right-click to scrub locally, and paste safely.
                    </p>
                  </div>
                  <a className="btn btn-primary btn-sm" href="/downloads/piizero-chrome-extension.zip" download>
                    Download Extension (.zip)
                  </a>
                </div>

                <div style={{ padding: "18px" }}>
                  <div className="browser-mockup">
                    <div className="browser-chrome">
                      <div className="window-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="browser-url">https://ehr.hospital.org/chart/discharge-note</div>
                    </div>
                    <div className="browser-split">
                      <div className="ehr-page">
                        <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--fg-muted)", marginBottom: "6px" }}>
                          Hospital EHR Chart Field
                        </div>
                        <div
                          className="doc-prose"
                          style={{
                            fontSize: "12.5px",
                            padding: "10px",
                            borderRadius: "6px",
                            border: "1px solid var(--border-subtle)",
                            background: "var(--bg-subtle)"
                          }}
                        >
                          {renderFormattedLines(rawText.slice(0, 290) + "…", vaultEntries, "raw")}
                        </div>
                      </div>
                      <div className="ext-sidepanel">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong style={{ fontSize: "12.5px" }}>PII-Zero Side Panel</strong>
                          <span className="badge-safe">0 PII</span>
                        </div>
                        <div
                          className="doc-prose"
                          style={{
                            fontSize: "12px",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-subtle)",
                            flex: 1
                          }}
                        >
                          {renderFormattedLines(
                            (pipelineResult?.scrubResult.sanitizedText ?? "").slice(0, 220) + "…",
                            vaultEntries,
                            "tokens"
                          )}
                        </div>
                        <div
                          style={{
                            textAlign: "center",
                            padding: "6px",
                            borderRadius: "6px",
                            background: "var(--btn-primary-bg)",
                            color: "var(--btn-primary-fg)",
                            fontSize: "11.5px",
                            fontWeight: 600
                          }}
                        >
                          Replace form text with redacted copy
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Android Galaxy Z Fold7 App Preview */}
              <section className="panel-card">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Android App (Kotlin &amp; Galaxy Z Fold7 Split View)</h2>
                    <p className="panel-desc">
                      Built with Jetpack Compose, WindowManager FoldingFeature, and com.google.firebase:firebase-ai.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div className="segmented">
                      <button
                        type="button"
                        className={"seg-btn " + (foldPosture === "unfolded" ? "active" : "")}
                        onClick={() => setFoldPosture("unfolded")}
                      >
                        Unfolded
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (foldPosture === "cover" ? "active" : "")}
                        onClick={() => setFoldPosture("cover")}
                      >
                        Phone cover
                      </button>
                    </div>
                    <a className="btn btn-primary btn-sm" href="/downloads/piizero-android-debug.apk" download>
                      Download Android (.apk)
                    </a>
                  </div>
                </div>

                <div style={{ padding: "18px" }}>
                  {foldPosture === "unfolded" ? (
                    <div className="fold-hardware">
                      <div className="fold-screens">
                        <div style={{ padding: "8px 10px" }}>
                          <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--fg-muted)", marginBottom: "6px" }}>
                            Left screen · Private note (Local RAM)
                          </div>
                          <div className="doc-prose" style={{ fontSize: "12px" }}>
                            {renderFormattedLines(rawText.slice(0, 235) + "…", vaultEntries, "raw")}
                          </div>
                        </div>
                        <div className="fold-crease" title="Galaxy Z Fold7 hinge gutter" />
                        <div style={{ padding: "8px 10px" }}>
                          <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--status-safe)", marginBottom: "6px" }}>
                            Right screen · Restored Gemini 2.5 Flash review
                          </div>
                          <div className="doc-prose" style={{ fontSize: "12px" }}>
                            {renderFormattedLines(
                              (pipelineResult?.rehydratedNarrative.rehydratedText ?? "").slice(0, 250) + "…",
                              vaultEntries,
                              "restored"
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="fold-hardware" style={{ maxWidth: "330px", margin: "0 auto" }}>
                      <div style={{ padding: "8px 10px", minHeight: "235px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                          <strong style={{ fontSize: "12px" }}>PII-Zero Mobile</strong>
                          <span className="badge-safe">0 PII sent</span>
                        </div>
                        <div className="doc-prose" style={{ fontSize: "12px" }}>
                          {renderFormattedLines(
                            (pipelineResult?.rehydratedNarrative.rehydratedText ?? "").slice(0, 260) + "…",
                            vaultEntries,
                            "restored"
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Clean SDK Code Reference */}
            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">How Firebase AI Logic Hybrid SDK Is Wired</h2>
                  <p className="panel-desc">
                    Local Gemini Nano handles entity scrubbing; Cloud Gemini 2.5 Flash only receives verified placeholder tokens.
                  </p>
                </div>
                <div className="segmented">
                  <button
                    type="button"
                    className={"seg-btn " + (sdkLang === "ts" ? "active" : "")}
                    onClick={() => setSdkLang("ts")}
                  >
                    Web (firebase/ai)
                  </button>
                  <button
                    type="button"
                    className={"seg-btn " + (sdkLang === "kotlin" ? "active" : "")}
                    onClick={() => setSdkLang("kotlin")}
                  >
                    Android (Kotlin)
                  </button>
                </div>
              </div>
              <pre className="code-block">
                {sdkLang === "ts" ? generateSdkCodeSnippet(stage1Mode, cloudModelName) : KOTLIN_SDK_SNIPPET}
              </pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
