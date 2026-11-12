import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AirlockCanvasBackdrop,
  BorderBeam,
  MagicCard,
  BlurFade,
  HyperText,
  NumberTicker,
  ShimmerButton,
  HybridAirlockBridge,
  AnimatedShinyText,
  AnimatedThemeToggler,
  GlyphMatrix,
  DiaTextReveal,
  GlareHover,
  Marquee,
  RippleButton,
  InteractiveHoverButton,
  AnimatedCircularProgressBar,
  Terminal,
  TypingAnimation,
  AnimatedSpan,
  CodeComparison,
  SafariMockup,
  AndroidMockup
} from "./components/MagicUiPrimitives";
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
  probeOnDeviceCapability,
  runHybridAirlockPipeline,
  askHybridDocumentQuestion,
  generateSdkCodeSnippet,
  isLiveFirebaseConfigured,
  type FirebaseWebConfig,
  type HybridPipelineExecutionResult,
  type OnDeviceProbeStatus,
  type QaAnswerSection
} from "./engine/firebaseHybridSdk";
import {
  buildVerifiedRedactedPdfBytes,
  extractClientFileTextInRam,
  getStrategyDisplayForEntry,
  scrubQuestionWithVaultPreview,
  transformSanitizedTextByStrategy,
  type HybridRoutingPolicy,
  type RedactionOutputStrategy
} from "./engine/documentIoAndModes";
import {
  BATCH_PACKETS,
  COMPLIANCE_PROFILES,
  FIREWALL_CATEGORY_GROUPS,
  FIREWALL_SCENARIOS,
  buildBatchPacketPdfBytes,
  evaluatePromptFirewall,
  generateFirewallSafeRewrite,
  runBatchCorpusAirlock,
  type BatchDocumentInput,
  type ComplianceProfileId,
  type FirewallActionTask
} from "./engine/batchAndFirewall";

type SidebarNav = "home" | "document" | "batch" | "firewall" | "history" | "settings" | "help";
type LeftDocTab = "document" | "redacted" | "audit";
type RightPanelTab = "insights" | "qa";
type PillColor = "blue" | "green" | "purple" | "amber";

interface DocTabMeta {
  id: string;
  fileName: string;
  ext: "pdf" | "docx";
  instTitle: string;
  instSub: string;
  showInstHeader: boolean;
  reportTitle: string;
  isLegal: boolean;
  rawDocument: string;
  customTerms: string[];
  extraEntities?: Array<{ value: string; category: PiiCategoryId }>;
  tokenAliases?: Record<string, string>;
  defaultLeftTab?: LeftDocTab;
  defaultRightTab?: RightPanelTab;
  defaultQuestion: string;
  quickChips: string[];
  kpi1Label: string;
  kpi1Main: string;
  kpi2Label: string;
  kpi2Main: string;
  kpi2Sub: string;
  kpi3Label: string;
  kpi3Main: string;
  kpi3Sub: string;
}

const WORKSPACE_DOCS: Record<string, DocTabMeta> = {
  "doc-medical-record": {
    id: "doc-medical-record",
    fileName: "Medical Record.pdf",
    ext: "pdf",
    instTitle: "Riverside Medical Center",
    instSub: "123 Health Way, Riverside, CA 90210",
    showInstHeader: true,
    reportTitle: "Patient Medical Report",
    isLegal: false,
    rawDocument: [
      "Patient Name: John Doe",
      "Date of Birth: 04/15/1978",
      "SSN: 123-45-6789",
      "Visit Summary:",
      "Patient presented with ongoing back pain and was evaluated for possible disc herniation. Recommended follow-up in 3 months.",
      "---",
      "Provider: Dr. Sarah Johnson",
      "Date of Visit: 10/23/2024",
      "---",
      "Treatment Plan:",
      "• Continue current medication",
      "• Physical therapy recommended",
      "• Follow-up appointment in 3 months"
    ].join("\n"),
    customTerms: [],
    extraEntities: [
      { value: "John Doe", category: "PATIENT_CLIENT_NAME" },
      { value: "Dr. Sarah Johnson", category: "PATIENT_CLIENT_NAME" }
    ],
    tokenAliases: {
      "John Doe": "[PATIENT_1]",
      "04/15/1978": "[DOB_1]",
      "123-45-6789": "[SSN_1]",
      "Dr. Sarah Johnson": "[PROVIDER_1]",
      "10/23/2024": "[VISIT_DATE_1]"
    },
    defaultLeftTab: "document",
    defaultRightTab: "insights",
    defaultQuestion: "What are the key findings and treatment plan for John Doe?",
    quickChips: ["Summarize this record", "What are the key findings?", "Any concerns?"],
    kpi1Label: "Patient Info",
    kpi1Main: "1 Patient",
    kpi2Label: "Visit Date",
    kpi2Main: "10/23/2024",
    kpi2Sub: "Most Recent Visit",
    kpi3Label: "Key Findings",
    kpi3Main: "Back Pain",
    kpi3Sub: "Disc Herniation"
  },
  "doc-nda-contract": {
    id: "doc-nda-contract",
    fileName: "NDA Contract.docx",
    ext: "docx",
    instTitle: "Non-Disclosure Agreement",
    instSub: "Corporate Confidentiality & Executive Terms",
    showInstHeader: false,
    reportTitle: "Non-Disclosure Agreement",
    isLegal: true,
    rawDocument: [
      'This Non-Disclosure Agreement ("Agreement") is entered into by and between Acme Corporation, a Delaware corporation, and John Smith, an individual, with an address at 123 Main Street, New York, NY.',
      "1. Confidential Information",
      "2. Obligations",
      "The parties agree to keep all confidential information, including but not limited to technical data, business plans, and financial information, in strict confidence.",
      "3. Term",
      "The terms of this Agreement shall continue for a period of 5 years from the date of this Agreement.",
      "4. Compensation",
      "The total compensation under this Agreement shall not exceed $1,000,000.",
      "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first above written."
    ].join("\n"),
    customTerms: ["Acme Corporation"],
    extraEntities: [
      { value: "John Smith", category: "PATIENT_CLIENT_NAME" },
      { value: "123 Main Street, New York, NY", category: "ADDRESS_ZIP" },
      { value: "$1,000,000", category: "SETTLEMENT_AMOUNT" }
    ],
    tokenAliases: {
      "Acme Corporation": "[COMPANY_A]",
      "John Smith": "[EXECUTIVE_1]",
      "123 Main Street, New York, NY": "[ADDRESS_1]",
      "$1,000,000": "[COMPENSATION_1]"
    },
    defaultLeftTab: "redacted",
    defaultRightTab: "qa",
    defaultQuestion:
      "Are there any risky non-compete clauses or unusual liability terms for Acme Corp?",
    quickChips: ["Summarize key risks", "What are the restrictions?", "Can this be modified?"],
    kpi1Label: "Parties",
    kpi1Main: "2 Parties",
    kpi2Label: "Term Length",
    kpi2Main: "5 Years",
    kpi2Sub: "12-Month Non-Compete",
    kpi3Label: "Liability Cap",
    kpi3Main: "$1,000,000",
    kpi3Sub: "Indirect Damages Excluded"
  },
  "preset-clinical-oncology-18": {
    id: "preset-clinical-oncology-18",
    fileName: "Oncology 18-ID.pdf",
    ext: "pdf",
    instTitle: "St. Jude Precision Genomics",
    instSub: "HIPAA 18-Identifier Stress Test · Inpatient Oncology & Lien Review",
    showInstHeader: true,
    reportTitle: "Inpatient Oncology & Medication Consult",
    isLegal: false,
    rawDocument: CLINICAL_LEGAL_PRESETS[0].rawDocument,
    customTerms: CLINICAL_LEGAL_PRESETS[0].defaultCustomTerms,
    defaultLeftTab: "document",
    defaultRightTab: "insights",
    defaultQuestion:
      "Are there any dangerous drug interactions or renal dosing concerns for Elena Rostova?",
    quickChips: ["Summarize this record", "Check CYP3A4 DDI", "Any bleeding concerns?"],
    kpi1Label: "Patient Info",
    kpi1Main: "1 Patient",
    kpi2Label: "Renal & ANC Lab",
    kpi2Main: "CrCl 39 mL/m",
    kpi2Sub: "ANC 420/mm³ · Tmax 39.2°C",
    kpi3Label: "Key Findings",
    kpi3Main: "CYP3A4 DDI",
    kpi3Sub: "Apixaban + Clarithromycin"
  },
  "preset-legal-ma-settlement": {
    id: "preset-legal-ma-settlement",
    fileName: "M&A Settlement.docx",
    ext: "docx",
    instTitle: "Cross-Border Patent Settlement",
    instSub: "FRE Rule 408 · IP Cross-License & Escrow Term Sheet",
    showInstHeader: true,
    reportTitle: "Patent Settlement & Escrow Term Sheet",
    isLegal: true,
    rawDocument: CLINICAL_LEGAL_PRESETS[1].rawDocument,
    customTerms: CLINICAL_LEGAL_PRESETS[1].defaultCustomTerms,
    defaultLeftTab: "redacted",
    defaultRightTab: "qa",
    defaultQuestion:
      "Are there any risky indemnity clauses or unusual liability terms for Aetheris Robotics GmbH?",
    quickChips: ["Summarize key risks", "Check Section 7.4", "Can indemnity be capped?"],
    kpi1Label: "Contract Parties",
    kpi1Main: "2 Parties",
    kpi2Label: "Escrow Exposure",
    kpi2Main: "2 Tranches",
    kpi2Sub: "Wire & Milestone Holdback",
    kpi3Label: "Key Findings",
    kpi3Main: "Uncapped §7.4",
    kpi3Sub: "Consequential Liability Risk"
  },
  "preset-psych-42cfr": {
    id: "preset-psych-42cfr",
    fileName: "ER Psych Triage.pdf",
    ext: "pdf",
    instTitle: "Harborview Behavioral Pavilion",
    instSub: "42 CFR Part 2 Substance Use & Pharmacology Intake",
    showInstHeader: true,
    reportTitle: "Behavioral Health & MAT Triage Report",
    isLegal: false,
    rawDocument: CLINICAL_LEGAL_PRESETS[2].rawDocument,
    customTerms: CLINICAL_LEGAL_PRESETS[2].defaultCustomTerms,
    defaultLeftTab: "document",
    defaultRightTab: "insights",
    defaultQuestion:
      "Is carbamazepine or methadone safe given Devon Kowalski's ECG and genomic panel?",
    quickChips: ["Check QTc 488ms risk", "Review HLA-B*15:02 lock", "Summarize MAT plan"],
    kpi1Label: "Patient Info",
    kpi1Main: "1 Patient",
    kpi2Label: "ECG Telemetry",
    kpi2Main: "QTc 488 ms",
    kpi2Sub: "COWS Score 19",
    kpi3Label: "Key Findings",
    kpi3Main: "SJS/TEN Lock",
    kpi3Sub: "HLA-B*15:02 Positive"
  },
  "preset-fda-medwatch-udi": {
    id: "preset-fda-medwatch-udi",
    fileName: "FDA MedWatch.pdf",
    ext: "pdf",
    instTitle: "FDA MedWatch 3500A Investigation",
    instSub: "21 CFR Part 803 Cardiac UDI Telemetry & MDL Audit",
    showInstHeader: true,
    reportTitle: "Adverse Device Event Report",
    isLegal: true,
    rawDocument: CLINICAL_LEGAL_PRESETS[3].rawDocument,
    customTerms: CLINICAL_LEGAL_PRESETS[3].defaultCustomTerms,
    defaultLeftTab: "document",
    defaultRightTab: "insights",
    defaultQuestion:
      "Does this CardioPulse Gen4 Lead event trigger the 5-day FDA 3500A reporting clock?",
    quickChips: ["Check 5-day FDA deadline", "Summarize RV lead failure", "MDL exposure?"],
    kpi1Label: "Claimant Info",
    kpi1Main: "1 Claimant",
    kpi2Label: "Lead Impedance",
    kpi2Main: ">3,000 Ohms",
    kpi2Sub: "36J Shock",
    kpi3Label: "Key Findings",
    kpi3Main: "5-Day 3500A",
    kpi3Sub: "21 CFR §803.53"
  }
};

interface QaConversationItem {
  id: string;
  question: string;
  sanitizedQuestion: string;
  timestamp: string;
  intro: string;
  sections: QaAnswerSection[];
}

interface AuditHistoryEntry {
  id: string;
  fileName: string;
  ext: "pdf" | "docx";
  presetId: string;
  maskedCount: number;
  sha256Short: string;
  whenLabel: string;
}

const KOTLIN_SDK_SNIPPET = `// Android & Galaxy Z Fold7 — com.google.firebase:firebase-ai
val scrub = PiiAirlockEngine.scrub(rawClinicalNote, customPolicyTerms)
check(PiiAirlockEngine.verifyZeroLeak(scrub.sanitizedText, scrub.vault).passed) {
    "Blocked outbound request: raw patient or client identifier detected"
}

val cloudModel = Firebase.ai(backend = GenerativeBackend.googleAI())
    .generativeModel(modelName = "gemini-2.5-flash")

val response = cloudModel.generateContent(scrub.sanitizedText)
val restoredView = PiiAirlockEngine.rehydrate(response.text.orEmpty(), scrub.vault)`;

function getCategoryColor(cat: PiiCategoryId): PillColor {
  switch (cat) {
    case "PATIENT_CLIENT_NAME":
    case "COUNSEL_JUDGE":
    case "CUSTOM_POLICY":
      return "blue";
    case "DOB_AGE":
    case "ADDRESS_ZIP":
    case "SETTLEMENT_AMOUNT":
      return "green";
    case "SSN":
    case "MRN":
    case "ACCOUNT_IBAN":
    case "HEALTH_PLAN_ID":
    case "BIOMETRIC_GENETIC":
    case "DEVICE_UDI":
    case "CASE_DOCKET":
      return "purple";
    default:
      return "amber";
  }
}

function getEntryPillColor(entry: VaultEntry): PillColor {
  if (entry.token === "[EXECUTIVE_1]") return "purple";
  return getCategoryColor(entry.category);
}

function getCategoryShortType(cat: PiiCategoryId): string {
  switch (cat) {
    case "PATIENT_CLIENT_NAME":
      return "Person";
    case "COUNSEL_JUDGE":
      return "Counsel / Judge";
    case "CUSTOM_POLICY":
      return "Company";
    case "DOB_AGE":
      return "Date";
    case "ADDRESS_ZIP":
      return "Address";
    case "SETTLEMENT_AMOUNT":
      return "Amount";
    case "SSN":
      return "SSN";
    case "MRN":
      return "Medical ID";
    case "ACCOUNT_IBAN":
      return "Account / IBAN";
    case "CASE_DOCKET":
      return "Docket ID";
    case "DEVICE_UDI":
      return "Device UDI";
    case "BIOMETRIC_GENETIC":
      return "Genomic / Bio";
    case "EMAIL":
      return "Email";
    case "PHONE_FAX":
      return "Phone";
    default:
      return "Identifier";
  }
}

function maskDisplayValue(entry: VaultEntry, isVisible: boolean): string {
  if (!isVisible) {
    if (entry.category === "SSN" && entry.originalValue.length >= 4) {
      return "***-**-" + entry.originalValue.slice(-4);
    }
    return "••••••••••";
  }
  return entry.originalValue;
}

function PillMiniIcon({ category }: { category: PiiCategoryId }) {
  if (category === "PATIENT_CLIENT_NAME" || category === "COUNSEL_JUDGE") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2.2c-3.8 0-7.5 1.9-7.5 4.6V21h15v-2.2c0-2.7-3.7-4.6-7.5-4.6z" />
      </svg>
    );
  }
  if (category === "DOB_AGE") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </svg>
    );
  }
  if (category === "ADDRESS_ZIP") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M12 21s-7-5.7-7-11a7 7 0 1 1 14 0c0 5.3-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }
  if (category === "SETTLEMENT_AMOUNT") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
    </svg>
  );
}

function ShieldSparkleLogo() {
  return (
    <svg className="brand-shield" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="34" height="34" rx="9" fill="#0B1220" />
      <rect x="3.75" y="3.75" width="32.5" height="32.5" rx="8.25" stroke="#1E293B" strokeWidth="1.5" />
      <path
        d="M20 8.2L30 12.2v6.6c0 6.2-4.2 11.4-10 13.1-5.8-1.7-10-6.9-10-13.1v-6.6L20 8.2z"
        stroke="#10B981"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="16.5" y="16" width="7" height="7" rx="1.6" fill="#38BDF8" />
      <path d="M20 12.2v2.2M20 24.6v2.2M13.2 19.5h2.1M24.7 19.5h2.1" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function replaceTokensWithValues(
  text: string,
  vaultEntries: VaultEntry[],
  hiddenTokens: Set<string>
): string {
  const sorted = [...vaultEntries].sort((a, b) => b.token.length - a.token.length);
  return sorted.reduce((acc, entry) => {
    const val = maskDisplayValue(entry, !hiddenTokens.has(entry.token));
    return acc.split(entry.token).join(val);
  }, text);
}

export const App: React.FC = () => {
  const urlInit = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        nav: "document" as SidebarNav,
        left: "document" as LeftDocTab,
        right: "insights" as RightPanelTab,
        initialDocId: "doc-medical-record",
        leak: false,
        rehydrate: true
      };
    }
    const q = new URLSearchParams(window.location.search);
    const rawNav = q.get("nav") || q.get("tab") || q.get("view");
    const nav: SidebarNav =
      rawNav === "home"
        ? "home"
        : rawNav === "batch"
        ? "batch"
        : rawNav === "firewall" || rawNav === "prompt"
        ? "firewall"
        : rawNav === "history" || rawNav === "vault"
        ? "history"
        : rawNav === "settings"
        ? "settings"
        : rawNav === "help" || rawNav === "apps"
        ? "help"
        : "document";

    const docParam = q.get("doc");
    const presetParam = q.get("preset");
    let initialDocId = "doc-medical-record";
    if (docParam && WORKSPACE_DOCS[docParam]) {
      initialDocId = docParam;
    } else if (presetParam === "1" || docParam === "nda") {
      initialDocId = "doc-nda-contract";
    } else if (presetParam === "2") {
      initialDocId = "preset-psych-42cfr";
    } else if (presetParam === "3") {
      initialDocId = "preset-fda-medwatch-udi";
    } else if (presetParam === "18") {
      initialDocId = "preset-clinical-oncology-18";
    }

    const defMeta = WORKSPACE_DOCS[initialDocId] ?? WORKSPACE_DOCS["doc-medical-record"];
    const rawLeft = q.get("left");
    const left: LeftDocTab =
      rawLeft === "redacted" || rawLeft === "wire"
        ? "redacted"
        : rawLeft === "audit"
        ? "audit"
        : rawLeft === "document"
        ? "document"
        : defMeta.defaultLeftTab ?? "document";

    const rawRight = q.get("right");
    const right: RightPanelTab =
      rawRight === "qa"
        ? "qa"
        : rawRight === "insights"
        ? "insights"
        : defMeta.defaultRightTab ?? "insights";

    const leak = q.get("leak") === "1";
    const rehydrate = q.get("lens") !== "tokens";
    return { nav, left, right, initialDocId, leak, rehydrate };
  }, []);

  const initialDoc = WORKSPACE_DOCS[urlInit.initialDocId] ?? WORKSPACE_DOCS["doc-medical-record"];

  const [sidebarNav, setSidebarNav] = useState<SidebarNav>(urlInit.nav);
  const [leftTab, setLeftTab] = useState<LeftDocTab>(urlInit.left);
  const [rightTab, setRightTab] = useState<RightPanelTab>(urlInit.right);
  const [openPresetIds, setOpenPresetIds] = useState<string[]>(() => {
    const base = ["doc-medical-record", "doc-nda-contract"];
    if (!base.includes(initialDoc.id)) base.push(initialDoc.id);
    return base;
  });
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDoc.id);
  const [customDocMeta, setCustomDocMeta] = useState<DocTabMeta | null>(null);

  const [rawText, setRawText] = useState<string>(initialDoc.rawDocument);
  const [customTermsInput, setCustomTermsInput] = useState<string>(
    initialDoc.customTerms.join(", ")
  );
  const [peekEnabled, setPeekEnabled] = useState<boolean>(true);
  const [activePeekOccurrenceKey, setActivePeekOccurrenceKey] = useState<string>("first");
  const [activePeekToken, setActivePeekToken] = useState<string | null>(null);
  const [hoveredEntityToken, setHoveredEntityToken] = useState<string | null>(null);
  const [hiddenVaultTokens, setHiddenVaultTokens] = useState<Set<string>>(() => new Set());
  const [rehydrateRight, setRehydrateRight] = useState<boolean>(urlInit.rehydrate);
  const [redactionStrategy, setRedactionStrategy] = useState<RedactionOutputStrategy>("smart_tokens");
  const [routingPolicy, setRoutingPolicy] = useState<HybridRoutingPolicy>("hybrid_cloud");
  const [hybridInspectorOpen, setHybridInspectorOpen] = useState<boolean>(false);
  const [onDeviceProbe, setOnDeviceProbe] = useState<OnDeviceProbeStatus | null>(null);
  const [selectedPhraseCandidate, setSelectedPhraseCandidate] = useState<string>("");
  const [manualMaskedTerms, setManualMaskedTerms] = useState<string[]>([]);

  const [stage1Mode, setStage1Mode] = useState<InferenceMode>(InferenceMode.ONLY_ON_DEVICE);
  const [cloudModelName, setCloudModelName] = useState<string>("gemini-2.5-flash");
  const [firebaseConfig] = useState<FirebaseWebConfig>(DEFAULT_DEMO_FIREBASE_CONFIG);
  const [sdkLang, setSdkLang] = useState<"ts" | "kotlin">("ts");
  const [foldPosture, setFoldPosture] = useState<"unfolded" | "cover">("unfolded");

  const [pipelineResult, setPipelineResult] = useState<HybridPipelineExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [qaThread, setQaThread] = useState<QaConversationItem[]>([]);
  const [questionDraft, setQuestionDraft] = useState<string>("");
  const [isAskingQa, setIsAskingQa] = useState<boolean>(false);
  const [askFocused, setAskFocused] = useState<boolean>(false);
  const [scanPulseKey, setScanPulseKey] = useState<number>(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uiTheme, setUiTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const qTheme = new URLSearchParams(window.location.search).get("theme");
    if (qTheme === "dark" || qTheme === "light") return qTheme;
    try {
      const saved = localStorage.getItem("piizero-theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      // ignore
    }
    return "light";
  });

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", uiTheme === "dark");
      document.documentElement.setAttribute("data-theme", uiTheme);
    }
  }, [uiTheme]);

  useEffect(() => {
    setScanPulseKey((k) => k + 1);
  }, [selectedDocId, stage1Mode, routingPolicy, manualMaskedTerms.length]);

  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [pasteDraftTitle, setPasteDraftTitle] = useState<string>("Client Document.pdf");
  const [pasteDraftBody, setPasteDraftBody] = useState<string>("");
  const [uploadStatusNote, setUploadStatusNote] = useState<string>("");
  const [isDragOverModal, setIsDragOverModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);

  // Batch Studio State (Multi-File Corpus Queue + Shared Cross-Doc Vault)
  const [selectedPacketId, setSelectedPacketId] = useState<string>(BATCH_PACKETS[0].id);
  const [extraBatchFiles, setExtraBatchFiles] = useState<Record<string, BatchDocumentInput[]>>({});
  const [selectedBatchFileId, setSelectedBatchFileId] = useState<string>(BATCH_PACKETS[0].files[0].id);
  const [batchPreviewMode, setBatchPreviewMode] = useState<"raw" | "redacted">("redacted");
  const [batchStrategy, setBatchStrategy] = useState<RedactionOutputStrategy>("smart_tokens");
  const [batchHighlightToken, setBatchHighlightToken] = useState<string | null>(null);

  // Prompt Firewall & Safe Composer State
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(FIREWALL_SCENARIOS[0].id);
  const [firewallProfile, setFirewallProfile] = useState<ComplianceProfileId>(FIREWALL_SCENARIOS[0].profile);
  const [firewallGroups, setFirewallGroups] = useState<string[]>(
    COMPLIANCE_PROFILES[FIREWALL_SCENARIOS[0].profile].enabledGroups
  );
  const [firewallRawPrompt, setFirewallRawPrompt] = useState<string>(FIREWALL_SCENARIOS[0].promptText);
  const [firewallEnforcement, setFirewallEnforcement] = useState<"auto_mask" | "strict_block">("auto_mask");
  const [firewallTask, setFirewallTask] = useState<FirewallActionTask>("polish_email");
  const [firewallShowRestored, setFirewallShowRestored] = useState<boolean>(true);

  const [simulatedLeakAlert, setSimulatedLeakAlert] = useState<{
    title: string;
    detail: string;
  } | null>(null);

  const [auditHistory, setAuditHistory] = useState<AuditHistoryEntry[]>([
    {
      id: "hist-1",
      fileName: "Medical Record.pdf",
      ext: "pdf",
      presetId: "doc-medical-record",
      maskedCount: 5,
      sha256Short: "8F4C21E90A",
      whenLabel: "2m ago"
    },
    {
      id: "hist-2",
      fileName: "NDA Contract.docx",
      ext: "docx",
      presetId: "doc-nda-contract",
      maskedCount: 4,
      sha256Short: "3D91B7C442",
      whenLabel: "12m ago"
    },
    {
      id: "hist-3",
      fileName: "Oncology 18-ID.pdf",
      ext: "pdf",
      presetId: "preset-clinical-oncology-18",
      maskedCount: 27,
      sha256Short: "7A10E5D318",
      whenLabel: "38m ago"
    },
    {
      id: "hist-4",
      fileName: "FDA MedWatch.pdf",
      ext: "pdf",
      presetId: "preset-fda-medwatch-udi",
      maskedCount: 19,
      sha256Short: "C48290FA11",
      whenLabel: "1h ago"
    }
  ]);

  const currentDocMeta: DocTabMeta = useMemo(() => {
    if (selectedDocId === "custom-doc" && customDocMeta) return customDocMeta;
    return WORKSPACE_DOCS[selectedDocId] ?? WORKSPACE_DOCS["doc-medical-record"];
  }, [selectedDocId, customDocMeta]);

  const buildDefaultQaTurn = useCallback(
    (res: HybridPipelineExecutionResult, docId: string): QaConversationItem => {
      const meta =
        docId === "custom-doc" && customDocMeta
          ? customDocMeta
          : WORKSPACE_DOCS[docId] ?? WORKSPACE_DOCS["doc-medical-record"];
      const vault = res.scrubResult.vaultEntries;
      const isCleanDoc = docId === "doc-nda-contract" || docId === "doc-medical-record";
      const sections: QaAnswerSection[] = res.analysis.pharmacovigilanceOrClauseAlerts.map(
        (alert) => {
          const body = isCleanDoc
            ? alert.mechanismOrClause
            : `${alert.mechanismOrClause} Recommended action: ${alert.recommendation}`;
          return {
            heading: replaceTokensWithValues(alert.title, vault, new Set()),
            cloudBody: body,
            restoredBody: replaceTokensWithValues(body, vault, new Set())
          };
        }
      );
      if (!isCleanDoc) {
        sections.push({
          heading: meta.isLegal ? "Other Key Points & Privilege Scope" : "Clinical Coding & Safe Summary",
          cloudBody: res.analysis.executiveSummary,
          restoredBody: replaceTokensWithValues(res.analysis.executiveSummary, vault, new Set())
        });
      }

      return {
        id: "qa-seed-" + docId,
        question: meta.defaultQuestion,
        sanitizedQuestion: scrubQuestionWithVaultPreview(meta.defaultQuestion, vault),
        timestamp: "10:24 AM",
        intro:
          docId === "doc-nda-contract"
            ? "I've reviewed the NDA agreement and here's the analysis:"
            : meta.isLegal
            ? "I've reviewed the anonymized agreement and here's the clause-by-clause analysis:"
            : "I've reviewed the medical record and here's the clinical breakdown:",
        sections
      };
    },
    [customDocMeta]
  );

  const executeAirlock = useCallback(
    async (
      inputDoc: string,
      customCsv: string,
      mode: InferenceMode,
      cfg: FirebaseWebConfig,
      modelName: string,
      docId: string,
      triggerDemoLeak = false,
      docMetaOverride?: DocTabMeta
    ) => {
      setIsRunning(true);
      if (!triggerDemoLeak) setSimulatedLeakAlert(null);
      try {
        const meta = docMetaOverride ?? WORKSPACE_DOCS[docId];
        const terms = customCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const result = await runHybridAirlockPipeline({
          rawText: inputDoc,
          customTerms: terms,
          extraEntities: meta?.extraEntities,
          tokenAliases: meta?.tokenAliases,
          stage1Mode: mode,
          firebaseConfig: cfg,
          cloudModelName: modelName
        });
        setPipelineResult(result);
        setActivePeekOccurrenceKey("first");
        setActivePeekToken(null);
        setQaThread([buildDefaultQaTurn(result, docId)]);

        if (meta) {
          setAuditHistory((prev) => {
            const updated: AuditHistoryEntry = {
              id: "hist-" + Date.now(),
              fileName: meta.fileName,
              ext: meta.ext,
              presetId: docId,
              maskedCount: result.scrubResult.telemetry.totalDetected,
              sha256Short: result.scrubResult.sanitizedSha256.slice(0, 10).toUpperCase(),
              whenLabel: "Just now"
            };
            const filtered = prev.filter((item) => item.presetId !== docId);
            return [updated, ...filtered].slice(0, 6);
          });
        }

        if (triggerDemoLeak) {
          const tampered = result.scrubResult.sanitizedText + "\nSSN: 419-82-6741";
          const check = verifyZeroPiiLeak(
            tampered,
            result.scrubResult.vaultEntries,
            result.scrubResult.rawText
          );
          if (!check.passed) {
            setSimulatedLeakAlert({
              title: "Outbound Cloud Request Blocked Before Leaving Device",
              detail: `Pre-send gatekeeper caught unredacted SSN (419-82-6741 -> ${check.leakedTokens.join(
                ", "
              )}) and aborted transmission (0 bytes sent to cloud).`
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
          // Verified locally in browser RAM
        }
      } finally {
        setIsRunning(false);
      }
    },
    [buildDefaultQaTurn]
  );

  useEffect(() => {
    void probeOnDeviceCapability().then(setOnDeviceProbe).catch(() => {});
    void executeAirlock(
      rawText,
      customTermsInput,
      stage1Mode,
      firebaseConfig,
      cloudModelName,
      selectedDocId,
      urlInit.leak
    );
  }, []);

  const handleSelectPresetDoc = (presetId: string) => {
    const found = WORKSPACE_DOCS[presetId];
    if (!found) return;
    if (!openPresetIds.includes(presetId)) {
      setOpenPresetIds((prev) => [...prev, presetId]);
    }
    setSelectedDocId(presetId);
    setSidebarNav("document");
    if (found.defaultLeftTab) setLeftTab(found.defaultLeftTab);
    if (found.defaultRightTab) setRightTab(found.defaultRightTab);
    setRawText(found.rawDocument);
    const csv = found.customTerms.join(", ");
    setCustomTermsInput(csv);
    setManualMaskedTerms([]);
    setSelectedPhraseCandidate("");
    setHoveredEntityToken(null);
    setHiddenVaultTokens(new Set());
    void executeAirlock(
      found.rawDocument,
      csv,
      stage1Mode,
      firebaseConfig,
      cloudModelName,
      presetId,
      false,
      found
    );
  };

  const handleCloseDocTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const remaining = openPresetIds.filter((id) => id !== tabId);
    if (remaining.length === 0) return;
    setOpenPresetIds(remaining);
    if (selectedDocId === tabId) {
      handleSelectPresetDoc(remaining[0]);
    }
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
        title: "Outbound Cloud Request Blocked Before Leaving Device",
        detail: `Simulated leak test appended raw SSN "419-82-6741" to outgoing payload. Stage 2 gatekeeper caught ${check.leakedTokens.join(
          ", "
        )} (${check.cloudPiiBytes} bytes) and canceled network I/O.`
      });
    }
  };

  const handleAskQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || !pipelineResult || isAskingQa) return;
    setRightTab("qa");
    setQuestionDraft("");
    setIsAskingQa(true);
    try {
      const qaRes = await askHybridDocumentQuestion({
        sanitizedDocumentText: pipelineResult.scrubResult.sanitizedText,
        rawQuestion: trimmed,
        vaultEntries: pipelineResult.scrubResult.vaultEntries,
        firebaseConfig,
        cloudModelName
      });
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setQaThread((prev) => [
        ...prev,
        {
          id: "qa-" + Date.now(),
          question: trimmed,
          sanitizedQuestion: qaRes.sanitizedQuestion,
          timestamp: timeStr,
          intro: qaRes.intro,
          sections: qaRes.sections
        }
      ]);
    } catch (err) {
      setSimulatedLeakAlert({
        title: "Question Blocked by Zero-PII Gatekeeper",
        detail: err instanceof Error ? err.message : "Unable to verify zero-PII question."
      });
    } finally {
      setIsAskingQa(false);
    }
  };

  const handleExportRedacted = () => {
    if (!pipelineResult) return;
    const transformed = transformSanitizedTextByStrategy(
      pipelineResult.scrubResult.sanitizedText,
      pipelineResult.scrubResult.vaultEntries,
      redactionStrategy
    );
    const pdfBytes = buildVerifiedRedactedPdfBytes({
      fileName: currentDocMeta.fileName,
      instTitle: currentDocMeta.instTitle,
      reportTitle: currentDocMeta.reportTitle,
      sha256: pipelineResult.scrubResult.sanitizedSha256,
      maskedCount: pipelineResult.scrubResult.telemetry.totalDetected,
      strategy: redactionStrategy,
      bodyText: transformed
    });
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentDocMeta.fileName.replace(/\.(pdf|docx|txt|md)$/i, "") + "-REDACTED.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySafePayload = () => {
    if (!pipelineResult) return;
    const transformed = transformSanitizedTextByStrategy(
      pipelineResult.scrubResult.sanitizedText,
      pipelineResult.scrubResult.vaultEntries,
      redactionStrategy
    );
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(transformed);
    }
    setCopiedId("redacted-payload");
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleMaskSelectedPhrase = (phraseRaw: string) => {
    const cleaned = phraseRaw.replace(/\s+/g, " ").trim();
    if (cleaned.length < 2 || cleaned.length > 72) return;
    const existing = customTermsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!existing.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      existing.push(cleaned);
    }
    const nextCsv = existing.join(", ");
    setCustomTermsInput(nextCsv);
    setManualMaskedTerms((prev) =>
      prev.some((p) => p.toLowerCase() === cleaned.toLowerCase())
        ? prev
        : [...prev, cleaned]
    );
    setSelectedPhraseCandidate("");
    window.getSelection()?.removeAllRanges();
    void executeAirlock(
      rawText,
      nextCsv,
      stage1Mode,
      firebaseConfig,
      cloudModelName,
      selectedDocId,
      false,
      currentDocMeta
    );
  };

  const handleRemoveManualTerm = (termToRemove: string) => {
    const remaining = customTermsInput
      .split(",")
      .map((s) => s.trim())
      .filter((t) => t && t.toLowerCase() !== termToRemove.toLowerCase());
    const nextCsv = remaining.join(", ");
    setCustomTermsInput(nextCsv);
    setManualMaskedTerms((prev) =>
      prev.filter((t) => t.toLowerCase() !== termToRemove.toLowerCase())
    );
    void executeAirlock(
      rawText,
      nextCsv,
      stage1Mode,
      firebaseConfig,
      cloudModelName,
      selectedDocId,
      false,
      currentDocMeta
    );
  };

  const handleSelectRoutingPolicy = (policy: HybridRoutingPolicy) => {
    setRoutingPolicy(policy);
    const nextStage1 =
      policy === "prefer_on_device"
        ? InferenceMode.PREFER_ON_DEVICE
        : InferenceMode.ONLY_ON_DEVICE;
    if (nextStage1 !== stage1Mode) {
      setStage1Mode(nextStage1);
      void executeAirlock(
        rawText,
        customTermsInput,
        nextStage1,
        firebaseConfig,
        cloudModelName,
        selectedDocId,
        false,
        currentDocMeta
      );
    }
  };

  const handleCaptureDocumentSelection = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().replace(/\s+/g, " ").trim() : "";
    if (text.length >= 2 && text.length <= 68 && !/^\[[A-Z0-9_]+\]$/.test(text)) {
      const alreadyVaulted = (pipelineResult?.scrubResult.vaultEntries ?? []).some(
        (v) => v.originalValue.toLowerCase() === text.toLowerCase()
      );
      if (!alreadyVaulted) {
        setSelectedPhraseCandidate(text);
        return;
      }
    }
    setSelectedPhraseCandidate("");
  };

  const handleCopySummary = (turn: QaConversationItem) => {
    const vault = pipelineResult?.scrubResult.vaultEntries ?? [];
    const text = [
      `Q: ${turn.question}`,
      turn.intro,
      ...turn.sections.map(
        (s) =>
          `• ${s.heading}: ${
            rehydrateRight
              ? replaceTokensWithValues(s.cloudBody, vault, hiddenVaultTokens)
              : s.cloudBody
          }`
      )
    ].join("\n\n");
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedId(turn.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const processUploadedClientFile = async (file: File) => {
    try {
      setUploadStatusNote(`Reading ${file.name} locally in browser RAM…`);
      const extracted = await extractClientFileTextInRam(file);
      setPasteDraftTitle(extracted.title);
      setPasteDraftBody(extracted.text);
      setUploadStatusNote(
        `Extracted ${extracted.text.length.toLocaleString()} characters in local RAM (0 bytes uploaded).`
      );
    } catch (err) {
      setPasteDraftTitle(file.name);
      setUploadStatusNote(
        err instanceof Error ? err.message : "Unable to read file locally; paste text below."
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processUploadedClientFile(file);
  };

  const handleLoadCustomDocument = () => {
    if (!pasteDraftBody.trim()) return;
    const cleanName = pasteDraftTitle.trim() || "Confidential_Note.pdf";
    const isDocx = cleanName.toLowerCase().endsWith(".docx");
    const meta: DocTabMeta = {
      id: "custom-doc",
      fileName: cleanName,
      ext: isDocx ? "docx" : "pdf",
      instTitle: cleanName.replace(/\.(pdf|docx|txt|md)$/i, ""),
      instSub: "Loaded in Local Browser RAM · Zero-Trust Hybrid Airlock Active",
      showInstHeader: true,
      reportTitle: "Confidential Document Review",
      isLegal: isDocx || /agreement|contract|clause|escrow|nda/i.test(pasteDraftBody),
      rawDocument: pasteDraftBody,
      customTerms: customTermsInput.split(",").map((s) => s.trim()).filter(Boolean),
      defaultQuestion: "What are the highest-priority risks and recommended next steps?",
      quickChips: ["Summarize key risks", "What are the key findings?", "Any compliance concerns?"],
      kpi1Label: "Protected Scope",
      kpi1Main: "Local RAM",
      kpi2Label: "Cloud Payload",
      kpi2Main: "0 Raw PII",
      kpi2Sub: "SHA-256 Gate Verified",
      kpi3Label: "Hybrid Engine",
      kpi3Main: "Gemini 2.5",
      kpi3Sub: "Restored On-Device"
    };
    setCustomDocMeta(meta);
    if (!openPresetIds.includes("custom-doc")) {
      setOpenPresetIds((prev) => [...prev, "custom-doc"]);
    }
    setSelectedDocId("custom-doc");
    setRawText(pasteDraftBody);
    setUploadModalOpen(false);
    setSidebarNav("document");
    void executeAirlock(
      pasteDraftBody,
      customTermsInput,
      stage1Mode,
      firebaseConfig,
      cloudModelName,
      "custom-doc"
    );
  };

  const activeBatchPacket = useMemo(
    () => BATCH_PACKETS.find((p) => p.id === selectedPacketId) ?? BATCH_PACKETS[0],
    [selectedPacketId]
  );

  const combinedBatchInputs = useMemo(
    () => [
      ...activeBatchPacket.files,
      ...(extraBatchFiles[activeBatchPacket.id] ?? [])
    ],
    [activeBatchPacket, extraBatchFiles]
  );

  const batchCorpusResult = useMemo(
    () =>
      runBatchCorpusAirlock({
        packetId: activeBatchPacket.id,
        files: combinedBatchInputs,
        customTerms: activeBatchPacket.customTerms,
        tokenAliases: activeBatchPacket.tokenAliases
      }),
    [activeBatchPacket, combinedBatchInputs]
  );

  const activeBatchFile = useMemo(
    () =>
      batchCorpusResult.files.find((f) => f.id === selectedBatchFileId) ??
      batchCorpusResult.files[0],
    [batchCorpusResult, selectedBatchFileId]
  );

  const batchSharedVaultEntries = useMemo<VaultEntry[]>(
    () =>
      batchCorpusResult.sharedVault.map((s) => ({
        token: s.token,
        originalValue: s.originalValue,
        category: s.category,
        label: s.label,
        regulationRef: PII_CATEGORIES[s.category]?.regulationRef ?? "Zero-Trust Policy",
        severity: PII_CATEGORIES[s.category]?.severity ?? "HIGH",
        source: s.category === "CUSTOM_POLICY" ? "CUSTOM_POLICY" : "ON_DEVICE_NER",
        occurrences: s.totalOccurrences,
        byteLength: new TextEncoder().encode(s.originalValue).length
      })),
    [batchCorpusResult]
  );

  const handleAddFilesToBatch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const added: BatchDocumentInput[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      try {
        const parsed = await extractClientFileTextInRam(f);
        added.push({
          id: `batch-upload-${Date.now()}-${i}`,
          fileName: parsed.title,
          ext: parsed.ext,
          docRole: "Uploaded Exhibit",
          rawText: parsed.text
        });
      } catch {
        // Ignore unreadable file cleanly
      }
    }
    if (added.length > 0) {
      setExtraBatchFiles((prev) => ({
        ...prev,
        [activeBatchPacket.id]: [...(prev[activeBatchPacket.id] ?? []), ...added]
      }));
      setSelectedBatchFileId(added[0].id);
    }
    e.target.value = "";
  };

  const handleExportBatchPdf = () => {
    const pdfBytes = buildBatchPacketPdfBytes({
      packetName: activeBatchPacket.name,
      batchResult: batchCorpusResult,
      strategy: batchStrategy
    });
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeBatchPacket.id}-REDACTED-PACKET.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenBatchFileInWorkspace = (fileItem: typeof activeBatchFile) => {
    if (!fileItem) return;
    const meta: DocTabMeta = {
      id: "custom-doc",
      fileName: fileItem.fileName,
      ext: fileItem.ext,
      instTitle: activeBatchPacket.name,
      instSub: `${fileItem.docRole} · Linked from Batch Studio`,
      showInstHeader: true,
      reportTitle: fileItem.docRole,
      isLegal: activeBatchPacket.domain === "legal",
      rawDocument: fileItem.rawText,
      customTerms: activeBatchPacket.customTerms,
      extraEntities: batchSharedVaultEntries.map((v) => ({
        value: v.originalValue,
        category: v.category
      })),
      tokenAliases: activeBatchPacket.tokenAliases,
      defaultQuestion: "What are the highest-priority risks and next steps in this record?",
      quickChips: ["Summarize key risks", "What are the key findings?", "Any cross-file conflicts?"],
      kpi1Label: "Batch Packet",
      kpi1Main: `${batchCorpusResult.files.length} Files`,
      kpi2Label: "Shared Vault",
      kpi2Main: `${batchCorpusResult.sharedVault.length} Entities`,
      kpi2Sub: "Consistent Tokens",
      kpi3Label: "Cloud Payload",
      kpi3Main: "0 Raw PII",
      kpi3Sub: "SHA-256 Verified"
    };
    setCustomDocMeta(meta);
    if (!openPresetIds.includes("custom-doc")) {
      setOpenPresetIds((prev) => [...prev, "custom-doc"]);
    }
    setSelectedDocId("custom-doc");
    setRawText(fileItem.rawText);
    setSidebarNav("document");
    void executeAirlock(
      fileItem.rawText,
      activeBatchPacket.customTerms.join(", "),
      stage1Mode,
      firebaseConfig,
      cloudModelName,
      "custom-doc",
      false,
      meta
    );
  };

  const activeFirewallScenario = useMemo(
    () => FIREWALL_SCENARIOS.find((s) => s.id === selectedScenarioId) ?? FIREWALL_SCENARIOS[0],
    [selectedScenarioId]
  );

  const firewallEval = useMemo(
    () =>
      evaluatePromptFirewall({
        rawPrompt: firewallRawPrompt,
        enabledGroupIds: firewallGroups,
        customTerms: activeFirewallScenario.customTerms,
        extraEntities: activeFirewallScenario.extraEntities
      }),
    [firewallRawPrompt, firewallGroups, activeFirewallScenario]
  );

  const firewallRewrite = useMemo(
    () =>
      generateFirewallSafeRewrite({
        sanitizedPrompt: firewallEval.sanitizedPrompt,
        activeVault: firewallEval.activeVault,
        task: firewallTask
      }),
    [firewallEval, firewallTask]
  );

  const handleSelectFirewallScenario = (scenarioId: string) => {
    const found = FIREWALL_SCENARIOS.find((s) => s.id === scenarioId);
    if (!found) return;
    setSelectedScenarioId(found.id);
    setFirewallProfile(found.profile);
    setFirewallGroups(COMPLIANCE_PROFILES[found.profile].enabledGroups);
    setFirewallRawPrompt(found.promptText);
  };

  const handleSelectFirewallProfile = (prof: ComplianceProfileId) => {
    setFirewallProfile(prof);
    setFirewallGroups(COMPLIANCE_PROFILES[prof].enabledGroups);
  };

  const handleToggleFirewallGroup = (groupId: string) => {
    setFirewallProfile("custom_policy");
    setFirewallGroups((prev) =>
      prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId]
    );
  };

  const handleSaveFirebaseSettings = () => {
    void executeAirlock(
      rawText,
      customTermsInput,
      stage1Mode,
      firebaseConfig,
      cloudModelName,
      selectedDocId
    );
    setSidebarNav("document");
  };

  const toggleVaultTokenVisibility = (token: string) => {
    setHiddenVaultTokens((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  const vaultEntries = pipelineResult?.scrubResult.vaultEntries ?? [];
  const telemetry = pipelineResult?.scrubResult.telemetry;
  const analysis = pipelineResult?.analysis;
  const totalMasked = telemetry?.totalDetected ?? 0;
  const shortSha = (pipelineResult?.scrubResult.sanitizedSha256 ?? "").slice(0, 12).toUpperCase();
  const liveFirebase = isLiveFirebaseConfigured(firebaseConfig);

  const primaryPersonEntry = useMemo(() => {
    const persons = vaultEntries.filter((v) => v.category === "PATIENT_CLIENT_NAME");
    return (
      persons.find(
        (v) =>
          !v.token.startsWith("[PROVIDER") &&
          !/^(?:Dr\.|Prof\.)\s/i.test(v.originalValue)
      ) ?? persons[0] ?? null
    );
  }, [vaultEntries]);

  const primarySubjectName = useMemo(() => {
    if (!primaryPersonEntry) return "Protected Subject";
    return maskDisplayValue(
      primaryPersonEntry,
      !hiddenVaultTokens.has(primaryPersonEntry.token)
    );
  }, [primaryPersonEntry, hiddenVaultTokens]);

  const activePeekEntry = useMemo(() => {
    if (activePeekToken) {
      const found = vaultEntries.find((v) => v.token === activePeekToken);
      if (found) return found;
    }
    return primaryPersonEntry ?? vaultEntries[0] ?? null;
  }, [activePeekToken, primaryPersonEntry, vaultEntries]);

  const categoryCounts = useMemo(() => {
    const map = new Map<PiiCategoryId, number>();
    for (const v of vaultEntries) {
      map.set(v.category, (map.get(v.category) ?? 0) + v.occurrences);
    }
    return map;
  }, [vaultEntries]);

  /**
   * Renders raw text segment with interactive color-coded entity pills + dark floating Peek tooltip
   */
  const renderRawPillsInText = (
    text: string,
    linePrefix: string,
    firstTracker: { assigned: boolean }
  ): React.ReactNode => {
    const values = vaultEntries
      .map((v) => v.originalValue)
      .filter((v) => v.length >= 3)
      .sort((a, b) => b.length - a.length);
    if (values.length === 0) return text;
    const escaped = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const rx = new RegExp("(" + escaped.join("|") + ")", "g");
    const lookup = new Map<string, VaultEntry>();
    for (const entry of vaultEntries) {
      if (!lookup.has(entry.originalValue)) lookup.set(entry.originalValue, entry);
    }

    return text.split(rx).map((part, idx) => {
      const entry = lookup.get(part);
      if (!entry) return <React.Fragment key={idx}>{part}</React.Fragment>;

      let occKey = `${linePrefix}-${idx}-${entry.token}`;
      const isPrimaryPerson =
        entry.category === "PATIENT_CLIENT_NAME" &&
        !entry.token.startsWith("[PROVIDER") &&
        !/^(?:Dr\.|Prof\.)\s/i.test(entry.originalValue);
      if (!firstTracker.assigned && isPrimaryPerson) {
        occKey = "first";
        firstTracker.assigned = true;
      }

      const color = getEntryPillColor(entry);
      const isVisible = !hiddenVaultTokens.has(entry.token);
      const shownText =
        entry.category === "SSN" && isVisible
          ? "***-**-" + entry.originalValue.slice(-4)
          : maskDisplayValue(entry, isVisible);
      const showTooltip = peekEnabled && activePeekOccurrenceKey === occKey;
      const isCrossLinked = hoveredEntityToken === entry.token;

      return (
        <span
          key={idx}
          className="entity-pill-anchor"
          onMouseEnter={() => {
            setActivePeekOccurrenceKey(occKey);
            setActivePeekToken(entry.token);
            setHoveredEntityToken(entry.token);
          }}
          onMouseLeave={() => {
            setHoveredEntityToken((cur) => (cur === entry.token ? null : cur));
          }}
          onClick={() => {
            setActivePeekOccurrenceKey(occKey);
            setActivePeekToken(entry.token);
            if (entry.category === "SSN") toggleVaultTokenVisibility(entry.token);
          }}
        >
          {showTooltip && (
            <span className="peek-tooltip" role="status">
              <span>
                {entry.originalValue} → sent to cloud as <strong>{entry.token}</strong>
              </span>
              <span className="peek-tooltip-info">i</span>
            </span>
          )}
          <span className={`entity-pill ${color}${isCrossLinked ? " is-linked" : ""}`}>
            {entry.originalValue !== "Dr. Sarah Johnson" && (
              <PillMiniIcon category={entry.category} />
            )}
            <span>{shownText}</span>
            {entry.category === "SSN" && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                style={{ opacity: 0.78, marginLeft: "2px" }}
                aria-hidden="true"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M1 1l22 22" />
              </svg>
            )}
          </span>
        </span>
      );
    });
  };

  /**
   * Renders placeholder tokens ([PATIENT_1], Synthetic Alias, or Blackout) inside Redacted Version & raw token views
   */
  const renderTokenPillsInText = (
    text: string,
    strategy: RedactionOutputStrategy = "smart_tokens"
  ): React.ReactNode => {
    if (!text) return null;
    const byToken = new Map<string, { entry: VaultEntry; index: number }>();
    vaultEntries.forEach((v, idx) => byToken.set(v.token, { entry: v, index: idx }));

    return text.split(/(\[[A-Z][A-Z0-9_]*\]|\b5 years\b)/g).map((part, idx) => {
      if (part === "5 years") {
        return (
          <span key={idx} className="entity-pill amber" style={{ padding: "1px 8px", borderRadius: "6px" }}>
            5 years
          </span>
        );
      }
      if (/^\[[A-Z][A-Z0-9_]*\]$/.test(part)) {
        const hit = byToken.get(part);
        const entry = hit?.entry;
        const color = entry ? getEntryPillColor(entry) : "purple";
        const isCrossLinked = entry ? hoveredEntityToken === entry.token : false;
        const displayLabel =
          entry && hit
            ? getStrategyDisplayForEntry(entry, hit.index, strategy)
            : part;
        const isBlackout = strategy === "legal_blackout" && !!entry;
        return (
          <span
            key={idx}
            className={
              isBlackout
                ? `entity-pill blackout-pill${isCrossLinked ? " is-linked" : ""}`
                : `entity-pill ${strategy === "smart_tokens" ? "token-mono " : ""}${color}${
                    isCrossLinked ? " is-linked" : ""
                  }`
            }
            onMouseEnter={() => {
              if (entry) {
                setHoveredEntityToken(entry.token);
                setActivePeekToken(entry.token);
              }
            }}
            onMouseLeave={() => {
              if (entry) {
                setHoveredEntityToken((cur) => (cur === entry.token ? null : cur));
              }
            }}
            title={
              entry
                ? `Local RAM value: "${maskDisplayValue(entry, !hiddenVaultTokens.has(entry.token))}" → Cloud token ${entry.token}`
                : "Anonymized Cloud Token"
            }
          >
            {displayLabel}
          </span>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  /**
   * Renders right-side AI analysis / Q&A prose with soft blue locally restored entity pills + cross-panel hover linking
   */
  const renderRestoredProse = (cloudSourceText: string): React.ReactNode => {
    if (!cloudSourceText) return null;
    if (!rehydrateRight) {
      return renderTokenPillsInText(cloudSourceText, "smart_tokens");
    }
    const byToken = new Map<string, VaultEntry>();
    for (const v of vaultEntries) byToken.set(v.token, v);

    return cloudSourceText
      .split(/(\[[A-Z][A-Z0-9_]*\]|\b46-year-old\b|\b12-month\b)/g)
      .map((part, idx) => {
        if (part === "46-year-old" || part === "12-month") {
          return (
            <span
              key={idx}
              className="restored-pill"
              title="Derived locally without exposing raw birth dates or party identities"
            >
              {part}
            </span>
          );
        }
        if (/^\[[A-Z][A-Z0-9_]*\]$/.test(part)) {
          const entry = byToken.get(part);
          if (!entry) return <React.Fragment key={idx}>{part}</React.Fragment>;
          const shown = maskDisplayValue(entry, !hiddenVaultTokens.has(entry.token));
          const isCrossLinked = hoveredEntityToken === entry.token;
          return (
            <span
              key={idx}
              className={`restored-pill${isCrossLinked ? " is-linked" : ""}`}
              onMouseEnter={() => {
                setHoveredEntityToken(entry.token);
                setActivePeekToken(entry.token);
              }}
              onMouseLeave={() => {
                setHoveredEntityToken((cur) => (cur === entry.token ? null : cur));
              }}
              onClick={() => setActivePeekToken(entry.token)}
              title={`Restored locally in browser RAM from ${entry.token} — Cloud AI never saw "${entry.originalValue}"`}
            >
              {shown}
            </span>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      });
  };

  /**
   * Formats the active document in exact document order (clean KV blocks, dividers, bullets, and clauses)
   */
  const renderStructuredSheet = (mode: "raw" | "redacted") => {
    const source =
      mode === "raw" ? rawText : pipelineResult?.scrubResult.sanitizedText ?? "";
    const rawLines = source.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const firstTracker = { assigned: false };

    type DocBlock =
      | { kind: "kv"; items: Array<{ label: string; val: string }> }
      | { kind: "divider" }
      | { kind: "heading"; text: string }
      | { kind: "bullets"; items: string[] }
      | { kind: "paragraph"; text: string };

    const blocks: DocBlock[] = [];
    const pushKv = (label: string, val: string) => {
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "kv") {
        last.items.push({ label, val });
      } else {
        blocks.push({ kind: "kv", items: [{ label, val }] });
      }
    };

    rawLines.forEach((line, idx) => {
      if (idx === 0 && /^[A-Z0-9\s&—–\-():/]+$/.test(line) && line.length > 18) {
        return;
      }
      if (line === "---") {
        blocks.push({ kind: "divider" });
        return;
      }
      if (line.startsWith("• ") || line.startsWith("- ")) {
        const itemText = line.slice(2).trim();
        const last = blocks[blocks.length - 1];
        if (last && last.kind === "bullets") {
          last.items.push(itemText);
        } else {
          blocks.push({ kind: "bullets", items: [itemText] });
        }
        return;
      }
      if (line.includes("|") && line.includes(":")) {
        for (const seg of line.split("|").map((s) => s.trim())) {
          const cIdx = seg.indexOf(":");
          if (cIdx > 0 && cIdx < 32) {
            pushKv(seg.slice(0, cIdx + 1).trim(), seg.slice(cIdx + 1).trim());
          } else {
            blocks.push({ kind: "paragraph", text: seg });
          }
        }
        return;
      }
      if ((line.endsWith(":") && line.length < 56) || /^\d+\.\s+[A-Z][A-Za-z\s&-]{2,42}$/.test(line)) {
        blocks.push({ kind: "heading", text: line.replace(/:$/, "") });
        return;
      }
      const colonIdx = line.indexOf(":");
      if (
        colonIdx > 1 &&
        colonIdx <= 28 &&
        line.length < 110 &&
        /^[A-Za-z0-9\s/&()-]+$/.test(line.slice(0, colonIdx))
      ) {
        pushKv(line.slice(0, colonIdx + 1).trim(), line.slice(colonIdx + 1).trim());
        return;
      }
      blocks.push({ kind: "paragraph", text: line });
    });

    const renderInline = (txt: string, keyPrefix: string) =>
      mode === "raw"
        ? renderRawPillsInText(txt, keyPrefix, firstTracker)
        : renderTokenPillsInText(txt, redactionStrategy);

    return (
      <div
        className={mode === "redacted" ? "doc-paper compact" : "doc-paper"}
        onMouseUp={mode === "raw" ? handleCaptureDocumentSelection : undefined}
        onKeyUp={mode === "raw" ? handleCaptureDocumentSelection : undefined}
      >
        <div key={scanPulseKey} className="enclave-scanline" aria-hidden="true" />
        {currentDocMeta.showInstHeader && (
          <div className="doc-inst-header">
            <div className="doc-seal-box" aria-hidden="true">
              {currentDocMeta.isLegal ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M12 3v18M5 7h14M7 7l-3 6h6l-3-6zm10 0l-3 6h6l-3-6zM8 21h8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M22 12h-4l-3 7L9 5l-3 7H2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="doc-inst-name">{currentDocMeta.instTitle}</div>
              <div className="doc-inst-sub">{currentDocMeta.instSub}</div>
            </div>
            <span className="doc-enclave-stamp mono hide-xs">
              {mode === "raw" ? "LOCAL RAM" : "SCRUBBED"}
            </span>
          </div>
        )}

        <h2 className="doc-report-title">
          <DiaTextReveal key={`${mode}-${currentDocMeta.id}`} text={currentDocMeta.reportTitle} duration={0.75} />
        </h2>

        {blocks.map((blk, bIdx) => {
          if (blk.kind === "divider") {
            return <div key={bIdx} className="doc-section-divider" />;
          }
          if (blk.kind === "heading") {
            return (
              <h3 key={bIdx} className="doc-section-heading">
                {blk.text}
              </h3>
            );
          }
          if (blk.kind === "kv") {
            return (
              <div key={bIdx} className="doc-kv-grid">
                {blk.items.map((kv, kIdx) => (
                  <React.Fragment key={kIdx}>
                    <div className="doc-kv-label">{kv.label}</div>
                    <div>{renderInline(kv.val, `kv-${bIdx}-${kIdx}`)}</div>
                  </React.Fragment>
                ))}
              </div>
            );
          }
          if (blk.kind === "bullets") {
            return (
              <ul key={bIdx} className="doc-bullet-list">
                {blk.items.map((item, iIdx) => (
                  <li key={iIdx}>{renderInline(item, `li-${bIdx}-${iIdx}`)}</li>
                ))}
              </ul>
            );
          }
          return (
            <p key={bIdx} className="doc-paragraph">
              {renderInline(blk.text, `p-${bIdx}`)}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Magic UI DotPattern + NoiseTexture Precision Canvas Backdrop */}
      <AirlockCanvasBackdrop />

      <div className="pz-app">
        {/* Architectural Navigation Rail / Foldable Top Header */}
        <aside className="pz-sidebar" aria-label="Primary navigation">
          <div className="sidebar-top">
            <div className="sidebar-brand-row">
              <div className="brand-row-main">
                <button
                  type="button"
                  className="brand-lockup"
                  title="Toggle Workspace / Overview"
                  onClick={() => setSidebarNav((prev) => (prev === "document" ? "home" : "document"))}
                >
                  <ShieldSparkleLogo />
                  <div className="brand-text-group">
                    <span className="brand-wordmark">PII-Zero</span>
                    <AnimatedShinyText shimmerWidth={64} className="brand-subtag mono">
                      HYBRID AIRLOCK
                    </AnimatedShinyText>
                  </div>
                </button>
                <AnimatedThemeToggler
                  theme={uiTheme}
                  onThemeChange={setUiTheme}
                  className="sidebar-theme-btn"
                />
              </div>

              <div className="mobile-trust-actions">
                <div className="mobile-trust-pill" title="Pre-send gatekeeper verified 0 raw PII bytes leave your device">
                  <span className="live-emerald-dot" />
                  <AnimatedShinyText shimmerWidth={68} className="mono">
                    0 B PII EGRESS
                  </AnimatedShinyText>
                </div>
                <AnimatedThemeToggler
                  theme={uiTheme}
                  onThemeChange={setUiTheme}
                  className="mobile-theme-btn"
                />
              </div>
            </div>

            <nav className="sidebar-nav">
              {(
                [
                  {
                    id: "document" as SidebarNav,
                    label: "Document",
                    compact: "Document",
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M8 13h8M8 17h5" />
                      </svg>
                    )
                  },
                  {
                    id: "batch" as SidebarNav,
                    label: "Batch Studio",
                    compact: "Batch",
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <rect x="3" y="4" width="14" height="14" rx="2" />
                        <path d="M7 20h12a2 2 0 0 0 2-2V8" />
                        <path d="M7 9h6M7 13h4" />
                      </svg>
                    )
                  },
                  {
                    id: "firewall" as SidebarNav,
                    label: "Prompt Firewall",
                    compact: "Firewall",
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    )
                  },
                  {
                    id: "history" as SidebarNav,
                    label: "History",
                    compact: "Audit Log",
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    )
                  },
                  {
                    id: "settings" as SidebarNav,
                    label: "Settings",
                    compact: "SDK",
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" strokeLinecap="round" />
                      </svg>
                    )
                  },
                  {
                    id: "help" as SidebarNav,
                    label: "Help",
                    compact: "Apps",
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <rect x="5" y="2" width="14" height="20" rx="2.5" />
                        <path d="M12 18h.01" strokeLinecap="round" />
                      </svg>
                    )
                  }
                ] as const
              ).map((navItem) => {
                const isActive = sidebarNav === navItem.id;
                return (
                  <button
                    key={navItem.id}
                    type="button"
                    className={"sidebar-link " + (isActive ? "active" : "")}
                    onClick={() => setSidebarNav(navItem.id)}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="pzActiveSidebarPill"
                        className="sidebar-active-bg"
                        transition={{ type: "spring", stiffness: 460, damping: 36 }}
                      />
                    )}
                    <span className="sidebar-link-inner">
                      {navItem.icon}
                      <span className="hide-compact">{navItem.label}</span>
                      <span className="show-compact">{navItem.compact}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="sidebar-bottom">
            <div className="sidebar-enclave-card">
              <GlyphMatrix
                cellSize={12}
                color="#10b981"
                fadeBottom={0.35}
                className="enclave-card-glyphs"
              />
              <div className="sidebar-enclave-row">
                <span className="live-emerald-dot" />
                <span className="mono">ZERO-TRUST ENCLAVE</span>
              </div>
              <div className="sidebar-enclave-hash mono">
                SHA <HyperText text={`#${shortSha || "VERIFIED"}`} />
              </div>
              <div className="sidebar-motto">
                RAM-pinned local scrubbing prior to cloud inference.
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Canvas */}
        <div className="pz-main">
          {/* Unified Command & Live Airlock Telemetry Deck */}
          <header className="pz-topbar">
            {sidebarNav === "batch" ? (
              <div className="doc-tabs-row" role="tablist" aria-label="Batch packets">
                {BATCH_PACKETS.map((pkt) => {
                  const isAct = selectedPacketId === pkt.id;
                  return (
                    <button
                      key={pkt.id}
                      type="button"
                      role="tab"
                      aria-selected={isAct}
                      className={"doc-file-pill " + (isAct ? "active" : "")}
                      onClick={() => {
                        setSelectedPacketId(pkt.id);
                        setSelectedBatchFileId(pkt.files[0].id);
                        setBatchHighlightToken(null);
                      }}
                    >
                      {isAct && (
                        <motion.span
                          layoutId="pzDocSwitchIndicator"
                          className="doc-pill-active-bg"
                          transition={{ type: "spring", stiffness: 450, damping: 35 }}
                        />
                      )}
                      <span className="doc-pill-fg">
                        <span className={`file-type-icon ${pkt.domain === "legal" ? "docx" : "pdf"}`}>
                          {pkt.files.length}
                        </span>
                        <span>{pkt.name}</span>
                      </span>
                    </button>
                  );
                })}
                <input
                  ref={batchFileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv,.json"
                  style={{ display: "none" }}
                  onChange={(e) => void handleAddFilesToBatch(e)}
                />
                <ShimmerButton
                  type="button"
                  className="upload-shimmer-trigger"
                  onClick={() => batchFileInputRef.current?.click()}
                >
                  <span>+ Add Files</span>
                </ShimmerButton>
              </div>
            ) : sidebarNav === "firewall" ? (
              <div className="doc-tabs-row" role="tablist" aria-label="Prompt firewall scenarios">
                {FIREWALL_SCENARIOS.map((sc) => {
                  const isAct = selectedScenarioId === sc.id;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      role="tab"
                      aria-selected={isAct}
                      className={"doc-file-pill " + (isAct ? "active" : "")}
                      onClick={() => handleSelectFirewallScenario(sc.id)}
                    >
                      {isAct && (
                        <motion.span
                          layoutId="pzDocSwitchIndicator"
                          className="doc-pill-active-bg"
                          transition={{ type: "spring", stiffness: 450, damping: 35 }}
                        />
                      )}
                      <span className="doc-pill-fg">
                        <span className="file-type-icon fw">FW</span>
                        <span>{sc.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="doc-tabs-row" role="tablist" aria-label="Open documents">
                {openPresetIds.map((docId) => {
                  const meta =
                    docId === "custom-doc" && customDocMeta
                      ? customDocMeta
                      : WORKSPACE_DOCS[docId];
                  if (!meta) return null;
                  const isActive = sidebarNav === "document" && selectedDocId === docId;
                  return (
                    <button
                      key={docId}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={"doc-file-pill " + (isActive ? "active" : "")}
                      onClick={() => {
                        if (docId === "custom-doc") {
                          setSelectedDocId("custom-doc");
                          setSidebarNav("document");
                        } else {
                          handleSelectPresetDoc(docId);
                        }
                      }}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="pzDocSwitchIndicator"
                          className="doc-pill-active-bg"
                          transition={{ type: "spring", stiffness: 450, damping: 35 }}
                        />
                      )}
                      <span className="doc-pill-fg">
                        <span className={`file-type-icon ${meta.ext}`}>
                          {meta.ext === "docx" ? "DOC" : "PDF"}
                        </span>
                        <span>{meta.fileName}</span>
                        {openPresetIds.length > 1 && (
                          <span
                            className="doc-pill-close"
                            title="Close tab"
                            onClick={(e) => handleCloseDocTab(e, docId)}
                          >
                            ×
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}

                    <ShimmerButton
                  type="button"
                  className="upload-shimmer-trigger"
                  onClick={() => setUploadModalOpen(true)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  <span className="hide-compact">Load Doc</span>
                  <span className="show-compact">Load</span>
                </ShimmerButton>
              </div>
            )}

            <HybridAirlockBridge
              totalMasked={totalMasked}
              isRunning={isRunning}
              isAirgapped={routingPolicy === "airgapped_local_only"}
              liveFirebase={liveFirebase}
              isOpen={hybridInspectorOpen}
              shortSha={shortSha}
              onToggle={() => setHybridInspectorOpen((v) => !v)}
            />
          </header>

          {/* Magic UI Marquee — Live 18-Category HIPAA Safe Harbor & Enclave Telemetry Ribbon */}
          <div className="enclave-marquee-strip" aria-label="Live zero-trust enclave telemetry">
            <span className="marquee-pin-label mono hide-xs">
              <span className="live-emerald-dot" />
              LIVE TELEMETRY
            </span>
            <Marquee pauseOnHover durationSec={34} repeat={3}>
              <span className="marquee-chip mono">
                <strong>§164.514(b)</strong> 18/18 SAFE HARBOR RULES ARMED
              </span>
              <span className="marquee-dot">·</span>
              <span className="marquee-chip mono">
                STAGE 1: <strong>{stage1Mode === InferenceMode.ONLY_ON_DEVICE ? "ONLY_ON_DEVICE" : "PREFER_ON_DEVICE"}</strong>
              </span>
              <span className="marquee-dot">·</span>
              <span className="marquee-chip mono">
                VAULTED SPANS: <strong>{totalMasked} IN LOCAL RAM</strong>
              </span>
              <span className="marquee-dot">·</span>
              <span className="marquee-chip emerald mono">
                CLOUD EGRESS: <strong>0 RAW PII BYTES</strong>
              </span>
              <span className="marquee-dot">·</span>
              <span className="marquee-chip mono">
                RECEIPT: <strong>SHA-256 #{shortSha || "VERIFIED"}</strong>
              </span>
              <span className="marquee-dot">·</span>
              <span className="marquee-chip mono">
                STAGE 3: <strong>{routingPolicy === "airgapped_local_only" ? "AIR-GAPPED OFFLINE" : `${cloudModelName.toUpperCase()} + APP CHECK`}</strong>
              </span>
              <span className="marquee-dot">·</span>
            </Marquee>
          </div>

          {/* Animated Collapsible Firebase AI Logic Hybrid Routing & Runtime Telemetry Drawer */}
          <AnimatePresence initial={false}>
            {hybridInspectorOpen && (
              <motion.section
                key="hybrid-inspector"
                className="hybrid-inspector-drawer"
                aria-label="Firebase AI Logic Hybrid Routing Controls"
                initial={{ height: 0, opacity: 0, y: -6 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <BorderBeam size={84} duration={7} />
                <div className="hybrid-inspector-inner">
                  <div className="hybrid-inspector-top">
                    <div className="hybrid-mode-seg" role="radiogroup" aria-label="Firebase AI Logic routing policy">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={routingPolicy === "hybrid_cloud"}
                        className={"seg-pill" + (routingPolicy === "hybrid_cloud" ? " active" : "")}
                        onClick={() => handleSelectRoutingPolicy("hybrid_cloud")}
                      >
                        Hybrid (Nano Scrub → Gemini 2.5 Flash)
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={routingPolicy === "prefer_on_device"}
                        className={"seg-pill" + (routingPolicy === "prefer_on_device" ? " active" : "")}
                        onClick={() => handleSelectRoutingPolicy("prefer_on_device")}
                      >
                        PREFER_ON_DEVICE Airlock
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={routingPolicy === "airgapped_local_only"}
                        className={"seg-pill" + (routingPolicy === "airgapped_local_only" ? " active" : "")}
                        onClick={() => handleSelectRoutingPolicy("airgapped_local_only")}
                      >
                        Offline Air-Gapped (100% Local)
                      </button>
                    </div>

                    <button
                      type="button"
                      className="footer-link-btn"
                      onClick={() => setSidebarNav("settings")}
                    >
                      SDK Snippet &amp; Config →
                    </button>
                  </div>

                  <div className="hybrid-telemetry-chips">
                    <span className="telemetry-chip">
                      <strong>Stage 1 (firebase/ai):</strong>{" "}
                      <span className="mono">
                        {stage1Mode === InferenceMode.ONLY_ON_DEVICE ? "ONLY_ON_DEVICE" : "PREFER_ON_DEVICE"}
                      </span>{" "}
                      ·{" "}
                      {onDeviceProbe?.chromePromptApiDetected
                        ? `Gemini Nano (${onDeviceProbe.availability})`
                        : "18-Rule HIPAA Enclave + Nano Bridge"}
                    </span>
                    <span className="telemetry-chip">
                      <strong>Stage 2 Gatekeeper:</strong> 0 Raw PII Bytes · SHA-256{" "}
                      <HyperText className="mono" text={`#${shortSha || "VERIFIED"}`} />
                    </span>
                    <span className="telemetry-chip">
                      <strong>Stage 3:</strong>{" "}
                      {routingPolicy === "airgapped_local_only"
                        ? "Disabled (Air-Gapped Local Summary)"
                        : `ONLY_IN_CLOUD (${cloudModelName} + App Check)`}
                    </span>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Pre-Send Leak Blocker Alert Banner (when simulated or triggered) */}
          {simulatedLeakAlert && (
            <div className="leak-banner" role="alert">
              <div>
                <div className="leak-banner-title">{simulatedLeakAlert.title}</div>
                <div className="leak-banner-desc">{simulatedLeakAlert.detail}</div>
              </div>
              <button
                type="button"
                className="btn-outline-pill"
                onClick={() => setSimulatedLeakAlert(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ==================== VIEW 1: ACTIVE DOCUMENT WORKSPACE ==================== */}
          {sidebarNav === "document" && (
            <main className="workspace-split">
              {/* LEFT PANEL: Document / Redacted Version + Vault / Privacy Audit */}
              <MagicCard className="glass-panel" aria-label="Document and local redaction proof">
                <div className="card-tabbar">
                  <div className="card-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftTab === "document"}
                      className={"card-tab " + (leftTab === "document" ? "active" : "")}
                      onClick={() => setLeftTab("document")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M8 13h8M8 17h5" />
                      </svg>
                      <span>Source Doc</span>
                      {leftTab === "document" && (
                        <motion.span
                          layoutId="pzLeftPanelTabLine"
                          className="card-tab-indicator"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftTab === "redacted"}
                      className={"card-tab " + (leftTab === "redacted" ? "active" : "")}
                      onClick={() => setLeftTab("redacted")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="11" width="16" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                      <span className="hide-compact">Redacted Payload</span>
                      <span className="show-compact">Redacted</span>
                      {leftTab === "redacted" && (
                        <motion.span
                          layoutId="pzLeftPanelTabLine"
                          className="card-tab-indicator"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftTab === "audit"}
                      className={"card-tab " + (leftTab === "audit" ? "active" : "")}
                      onClick={() => setLeftTab("audit")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      <span className="hide-compact">Crypto Audit</span>
                      <span className="show-compact">Audit</span>
                      {leftTab === "audit" && (
                        <motion.span
                          layoutId="pzLeftPanelTabLine"
                          className="card-tab-indicator"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                    </button>
                  </div>

                  <div className="tab-controls-right">
                    <label className="peek-toggle-label">
                      <span>Peek</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={peekEnabled}
                        className={"ios-switch " + (peekEnabled ? "on" : "")}
                        onClick={() => setPeekEnabled((v) => !v)}
                      >
                        <span className="ios-switch-knob" />
                      </button>
                    </label>
                  </div>
                </div>

                {/* SUB-TAB A: Original Document with Inline Color-Coded Entity Pills + Guided Manual Redaction */}
                {leftTab === "document" && (
                  <div className="doc-sheet-wrap">
                    {selectedPhraseCandidate && (
                      <div className="selection-redact-bar" role="region" aria-label="Guided manual redaction">
                        <span className="selection-redact-text">
                          Selected: <strong>“{selectedPhraseCandidate}”</strong>
                        </span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                          <button
                            type="button"
                            className="btn-primary-pill"
                            style={{ height: "28px", padding: "0 12px", fontSize: "11.5px" }}
                            onClick={() => handleMaskSelectedPhrase(selectedPhraseCandidate)}
                          >
                            + Mask Phrase Locally
                          </button>
                          <button
                            type="button"
                            className="btn-outline-pill"
                            style={{ height: "28px", padding: "0 9px", fontSize: "11.5px" }}
                            onClick={() => setSelectedPhraseCandidate("")}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}

                    {manualMaskedTerms.length > 0 && (
                      <div className="manual-terms-strip" aria-label="User-added local redactions">
                        <span className="manual-terms-label">Guided Local Masks:</span>
                        {manualMaskedTerms.map((term) => (
                          <span key={term} className="manual-term-chip">
                            <span>{term}</span>
                            <button
                              type="button"
                              aria-label={`Remove custom mask ${term}`}
                              onClick={() => handleRemoveManualTerm(term)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {peekEnabled && activePeekEntry && (
                      <motion.div
                        key={activePeekEntry.token}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18 }}
                        className="mobile-peek-bar"
                        role="status"
                      >
                        <GlyphMatrix
                          cellSize={11}
                          color="#38bdf8"
                          fadeBottom={0}
                          className="peek-bar-glyphs"
                        />
                        <span className="mobile-peek-badge mono">VAULT</span>
                        <span className="mobile-peek-text">
                          <strong>{maskDisplayValue(activePeekEntry, !hiddenVaultTokens.has(activePeekEntry.token))}</strong>
                          <svg width="14" height="10" viewBox="0 0 16 10" fill="none" stroke="#64748b" strokeWidth="1.6" aria-hidden="true" style={{ flexShrink: 0 }}>
                            <path d="M1 5h13M10.5 1.5L14 5l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <HyperText className="mobile-peek-token" text={activePeekEntry.token} duration={280} />
                        </span>
                        <span className="mobile-peek-hint mono">TAP TAG</span>
                      </motion.div>
                    )}
                    <BlurFade key={`raw-${selectedDocId}`} duration={0.22} offset={4}>
                      {renderStructuredSheet("raw")}
                    </BlurFade>
                  </div>
                )}

                {/* SUB-TAB B: Redacted Version Sent to Cloud + Redaction Strategy + Local Entity Vault */}
                {leftTab === "redacted" && (
                  <BlurFade key={`redacted-${selectedDocId}-${redactionStrategy}`} className="doc-sheet-wrap" duration={0.22} offset={4}>
                    <div className="redaction-strategy-bar">
                      <div className="strategy-seg" role="radiogroup" aria-label="Redacted output mode">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={redactionStrategy === "smart_tokens"}
                          className={"strategy-btn" + (redactionStrategy === "smart_tokens" ? " active" : "")}
                          onClick={() => setRedactionStrategy("smart_tokens")}
                        >
                          Smart Tokens
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={redactionStrategy === "synthetic_alias"}
                          className={"strategy-btn" + (redactionStrategy === "synthetic_alias" ? " active" : "")}
                          onClick={() => setRedactionStrategy("synthetic_alias")}
                        >
                          Synthetic Alias
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={redactionStrategy === "legal_blackout"}
                          className={"strategy-btn" + (redactionStrategy === "legal_blackout" ? " active" : "")}
                          onClick={() => setRedactionStrategy("legal_blackout")}
                        >
                          Blackout
                        </button>
                      </div>

                      <button
                        type="button"
                        className="btn-outline-pill"
                        style={{ height: "28px", fontSize: "11.5px", padding: "0 10px" }}
                        onClick={handleCopySafePayload}
                      >
                        {copiedId === "redacted-payload" ? "✓ Copied Safe Text" : "Copy Safe Text"}
                      </button>
                    </div>

                    {renderStructuredSheet("redacted")}

                    <div className="vault-subcard">
                      <div className="vault-subcard-header">
                        <div className="vault-subcard-title">
                          <span className="vault-lock-badge" aria-hidden="true">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <rect x="4" y="11" width="16" height="10" rx="2" />
                              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                            </svg>
                          </span>
                          <div>
                            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink-900)" }}>
                              Local Entity Vault ({vaultEntries.length})
                            </div>
                            <div style={{ fontSize: "11.5px", color: "var(--ink-500)" }}>
                              Original values stored in browser RAM only · Hover to trace across panels
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-outline-pill"
                          style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                          onClick={handleExportRedacted}
                        >
                          <span className="hide-compact">↓ Export Redacted PDF</span>
                          <span className="show-compact">↓ Export PDF</span>
                        </button>
                      </div>

                      <div className="vault-table-scroll">
                        <table className="vault-table">
                          <thead>
                            <tr>
                              <th>Original Value</th>
                              <th>
                                {redactionStrategy === "synthetic_alias"
                                  ? "Synthetic Output"
                                  : redactionStrategy === "legal_blackout"
                                  ? "Redacted Output"
                                  : "Cloud Token"}
                              </th>
                              <th>Type</th>
                              <th>Visibility</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vaultEntries.map((entry, vIdx) => {
                              const isVis = !hiddenVaultTokens.has(entry.token);
                              const color = getEntryPillColor(entry);
                              const isCrossLinked = hoveredEntityToken === entry.token;
                              const outVal = getStrategyDisplayForEntry(entry, vIdx, redactionStrategy);
                              return (
                                <tr
                                  key={entry.token}
                                  className={isCrossLinked ? "vault-row-linked" : ""}
                                  onMouseEnter={() => {
                                    setHoveredEntityToken(entry.token);
                                    setActivePeekToken(entry.token);
                                  }}
                                  onMouseLeave={() =>
                                    setHoveredEntityToken((cur) => (cur === entry.token ? null : cur))
                                  }
                                >
                                  <td style={{ fontWeight: 500, color: "var(--ink-900)" }}>
                                    {maskDisplayValue(entry, isVis)}
                                  </td>
                                  <td>
                                    <span
                                      className={
                                        redactionStrategy === "legal_blackout"
                                          ? `entity-pill blackout-pill${isCrossLinked ? " is-linked" : ""}`
                                          : `entity-pill ${
                                              redactionStrategy === "smart_tokens" ? "token-mono " : ""
                                            }${color}${isCrossLinked ? " is-linked" : ""}`
                                      }
                                    >
                                      {outVal}
                                    </span>
                                  </td>
                                  <td style={{ color: "var(--ink-500)" }}>
                                    {getCategoryShortType(entry.category)}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={isVis}
                                      aria-label={`Toggle visibility for ${entry.token}`}
                                      className={"ios-switch " + (isVis ? "on" : "")}
                                      onClick={() => toggleVaultTokenVisibility(entry.token)}
                                    >
                                      <span className="ios-switch-knob" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="vault-mobile-list">
                        {vaultEntries.map((entry) => {
                          const isVis = !hiddenVaultTokens.has(entry.token);
                          const color = getEntryPillColor(entry);
                          return (
                            <div key={entry.token} className="vault-mobile-row">
                              <div className="vault-mobile-main">
                                <div className="vault-mobile-val">
                                  {maskDisplayValue(entry, isVis)}
                                </div>
                                <div className="vault-mobile-meta">
                                  <span className={`entity-pill token-mono ${color}`}>
                                    {entry.token}
                                  </span>
                                  <span className="vault-mobile-type">
                                    {getCategoryShortType(entry.category)}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={isVis}
                                aria-label={`Toggle visibility for ${entry.token}`}
                                className={"ios-switch " + (isVis ? "on" : "")}
                                onClick={() => toggleVaultTokenVisibility(entry.token)}
                              >
                                <span className="ios-switch-knob" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </BlurFade>
                )}

                {/* SUB-TAB C: Cryptographic Privacy Audit & Leak Blocker Proof */}
                {leftTab === "audit" && (
                  <BlurFade key={`audit-${selectedDocId}`} className="doc-sheet-wrap" style={{ overflowY: "auto" }} duration={0.22} offset={4}>
                    <div className="doc-paper" style={{ maxHeight: "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <AnimatedCircularProgressBar
                            value={100}
                            size={46}
                            strokeWidth={9}
                            gaugePrimaryColor="#10b981"
                          />
                          <div>
                            <h2 className="doc-report-title" style={{ marginBottom: "3px" }}>
                              Zero-Trust Pre-Send Cryptographic Audit
                            </h2>
                            <p style={{ fontSize: "12px", color: "var(--ink-500)" }}>
                              Receipt <HyperText className="mono" text={`#${shortSha}`} /> · Verified prior to HTTPS socket
                            </p>
                          </div>
                        </div>
                        <InteractiveHoverButton
                          type="button"
                          onClick={handleSimulateLeakAttempt}
                        >
                          Test Leak Blocker
                        </InteractiveHoverButton>
                      </div>

                      <div className="kpi-cards-grid" style={{ marginBottom: "14px" }}>
                        <GlareHover className="kpi-insight-card">
                          <span className="kpi-card-label mono">Stage 1 · On-Device</span>
                          <span className="kpi-card-value">{totalMasked} Masked</span>
                          <span className="kpi-card-sub">
                            {stage1Mode === InferenceMode.ONLY_ON_DEVICE ? "ONLY_ON_DEVICE" : "PREFER_ON_DEVICE"}
                          </span>
                        </GlareHover>
                        <GlareHover className="kpi-insight-card">
                          <span className="kpi-card-label mono">Stage 2 · Gatekeeper</span>
                          <span className="kpi-card-value" style={{ color: "#059669" }}>0 Bytes Leaked</span>
                          <span className="kpi-card-sub">
                            {telemetry?.sanitizedOutputBytes ?? 0} B safe payload
                          </span>
                        </GlareHover>
                        <GlareHover className="kpi-insight-card">
                          <span className="kpi-card-label mono">Stage 3 · Cloud AI</span>
                          <span className="kpi-card-value">Gemini 2.5</span>
                          <span className="kpi-card-sub">App Check Verified</span>
                        </GlareHover>
                      </div>

                      <Terminal title={`airlock-trace · ${currentDocMeta.fileName}`} className="audit-terminal">
                        <TypingAnimation duration={14}>
                          {`$ firebase-ai scrub --mode=${stage1Mode === InferenceMode.ONLY_ON_DEVICE ? "ONLY_ON_DEVICE" : "PREFER_ON_DEVICE"} "${currentDocMeta.fileName}"`}
                        </TypingAnimation>
                        <AnimatedSpan className="term-ok">
                          {`✓ Vaulted ${totalMasked} regulated PII spans in browser RAM (0 network calls)`}
                        </AnimatedSpan>
                        <AnimatedSpan className="term-info">
                          {`✓ verifyZeroPiiLeak() passed · SHA-256 #${shortSha || "VERIFIED"} · 0 raw PII bytes`}
                        </AnimatedSpan>
                        <AnimatedSpan className="term-ok">
                          {routingPolicy === "airgapped_local_only"
                            ? "✓ Air-Gapped mode active: Stage 3 cloud socket suppressed"
                            : `✓ Transmitted ${telemetry?.sanitizedOutputBytes ?? 0} B tokenized text to ${cloudModelName} & rehydrated locally`}
                        </AnimatedSpan>
                      </Terminal>

                      <h3 className="doc-section-heading" style={{ marginTop: "14px" }}>18 HIPAA Safe Harbor &amp; Legal Privilege Rules</h3>
                      <div style={{ maxHeight: "290px", overflowY: "auto", border: "1px solid #e5ecf6", borderRadius: "10px" }}>
                        <table className="vault-table">
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th>Token Format</th>
                              <th>Detected</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.values(PII_CATEGORIES).map((cat) => {
                              const count = categoryCounts.get(cat.id) ?? 0;
                              return (
                                <tr key={cat.id}>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{cat.label}</div>
                                    <div style={{ fontSize: "11px", color: "var(--ink-400)" }}>{cat.regulationRef}</div>
                                  </td>
                                  <td>
                                    <span className={`entity-pill token-mono ${getCategoryColor(cat.id)}`}>
                                      [{cat.tokenPrefix}_01]
                                    </span>
                                  </td>
                                  <td className="mono" style={{ fontWeight: count > 0 ? 700 : 400, color: count > 0 ? "#15803d" : "var(--ink-400)" }}>
                                    {count > 0 ? `✓ ${count} masked` : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </BlurFade>
                )}

                <div className="card-footer-strip">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <span className="live-emerald-dot" aria-hidden="true" />
                    <span>
                      <strong><NumberTicker value={totalMasked} /> PII entities</strong> masked in RAM · <span className="mono">0 B</span> cloud egress
                    </span>
                  </span>

                  <InteractiveHoverButton
                    type="button"
                    className="compact"
                    onClick={() =>
                      setLeftTab((prev) =>
                        prev === "document" ? "redacted" : prev === "redacted" ? "audit" : "document"
                      )
                    }
                  >
                    {leftTab === "document"
                      ? "Inspect Payload"
                      : leftTab === "redacted"
                      ? "Crypto Audit"
                      : "Source Doc"}
                  </InteractiveHoverButton>
                </div>
              </MagicCard>

              {/* RIGHT PANEL: AI Insights + Interactive Q&A Assistant */}
              <MagicCard className="glass-panel" aria-label="AI insights and document Q&A">
                <div className="card-tabbar">
                  <div className="card-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "insights"}
                      className={"card-tab " + (rightTab === "insights" ? "active" : "")}
                      onClick={() => setRightTab("insights")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12h4l3-7 4 14 3-7h4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Briefing</span>
                      {rightTab === "insights" && (
                        <motion.span
                          layoutId="pzRightPanelTabLine"
                          className="card-tab-indicator"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "qa"}
                      className={"card-tab " + (rightTab === "qa" ? "active" : "")}
                      onClick={() => setRightTab("qa")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 9l3 3-3 3M13 15h3" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="3" y="4" width="18" height="16" rx="2.5" />
                      </svg>
                      <span className="hide-compact">Ask Q&amp;A</span>
                      <span className="show-compact">Q&amp;A</span>
                      {rightTab === "qa" && (
                        <motion.span
                          layoutId="pzRightPanelTabLine"
                          className="card-tab-indicator"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                    </button>
                  </div>

                  <div className="tab-controls-right">
                    <div className="rehydrate-seg" role="group" aria-label="Entity display mode">
                      <button
                        type="button"
                        className={"rehydrate-seg-btn" + (rehydrateRight ? " active" : "")}
                        onClick={() => setRehydrateRight(true)}
                        title="Show locally restored identities"
                      >
                        Restored
                      </button>
                      <button
                        type="button"
                        className={"rehydrate-seg-btn" + (!rehydrateRight ? " active" : "")}
                        onClick={() => setRehydrateRight(false)}
                        title="Show raw anonymized tokens returned by Cloud AI"
                      >
                        Tokens
                      </button>
                    </div>
                  </div>
                </div>

                <div className="right-panel-body">
                  {/* RIGHT MODE 1: AI INSIGHTS */}
                  {rightTab === "insights" && (
                    <BlurFade key={`insights-${selectedDocId}-${rehydrateRight ? "r" : "t"}`} className="insights-stack" duration={0.22} offset={5}>
                      <div className="section-heading-row">
                        <h2 className="section-h3">
                          <DiaTextReveal
                            key={`${selectedDocId}-${routingPolicy}`}
                            text={
                              routingPolicy === "airgapped_local_only"
                                ? "On-Device Local Summary"
                                : "Executive Synthesis"
                            }
                            duration={0.8}
                          />
                        </h2>
                        <div className="synthesis-badges">
                          <AnimatedCircularProgressBar
                            value={100}
                            size={30}
                            strokeWidth={10}
                            gaugePrimaryColor="#10b981"
                            className="mini-zero-gauge"
                          />
                          {routingPolicy === "airgapped_local_only" ? (
                            <span className="offline-mode-tag">0 Network Calls</span>
                          ) : (
                            <span className="enclave-mini-tag mono">GEMINI 2.5 FLASH</span>
                          )}
                        </div>
                      </div>

                      <div className="summary-prose">
                        {renderRestoredProse(analysis?.executiveSummary ?? "")}
                      </div>

                      <div className="section-heading-row" style={{ marginTop: "2px" }}>
                        <span className="section-kicker mono">STRUCTURED TELEMETRY</span>
                        <span className="section-kicker mono" style={{ color: "var(--signal-emerald)" }}>ZERO-LEAK VERIFIED</span>
                      </div>

                      <div className="kpi-cards-grid">
                        <GlareHover className="kpi-insight-card">
                          <span className="kpi-card-label mono">{currentDocMeta.kpi1Label}</span>
                          <span className="kpi-card-value">{currentDocMeta.kpi1Main}</span>
                          <span className="kpi-card-sub">{primarySubjectName}</span>
                        </GlareHover>

                        <GlareHover className="kpi-insight-card" glareColor="rgba(37, 99, 235, 0.13)">
                          <span className="kpi-card-label mono">{currentDocMeta.kpi2Label}</span>
                          <span className="kpi-card-value">{currentDocMeta.kpi2Main}</span>
                          <span className="kpi-card-sub">{currentDocMeta.kpi2Sub}</span>
                        </GlareHover>

                        <GlareHover className="kpi-insight-card">
                          <span className="kpi-card-label mono">{currentDocMeta.kpi3Label}</span>
                          <span className="kpi-card-value">{currentDocMeta.kpi3Main}</span>
                          <span className="kpi-card-sub">{currentDocMeta.kpi3Sub}</span>
                        </GlareHover>
                      </div>

                      <div className="restored-banner">
                        <span className="live-emerald-dot" aria-hidden="true" />
                        <span className="restored-kicker mono">RAM REHYDRATION</span>
                        <span className="restored-copy">
                          {rehydrateRight
                            ? "Identities restored locally in browser memory; Cloud AI processed tokens only."
                            : "Viewing exact zero-PII token output returned by Cloud AI prior to rehydration."}
                        </span>
                      </div>

                      <div className="section-heading-row" style={{ marginTop: "2px" }}>
                        <span className="section-kicker mono">RECOMMENDED ACTIONS</span>
                      </div>

                      <div className="next-steps-list">
                        {analysis?.pharmacovigilanceOrClauseAlerts.map((alert, idx) => (
                          <motion.div
                            key={idx}
                            className="next-step-row"
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.05 * idx, duration: 0.22 }}
                          >
                            <span className="step-index-badge mono" aria-hidden="true">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="next-step-body">
                              {alert.title === alert.recommendation ? (
                                renderRestoredProse(alert.recommendation)
                              ) : (
                                <>
                                  <strong style={{ color: "var(--ink-900)" }}>{alert.title}: </strong>
                                  {renderRestoredProse(alert.recommendation)}
                                </>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </BlurFade>
                  )}

                  {/* RIGHT MODE 2: INTERACTIVE Q&A ASSISTANT */}
                  {rightTab === "qa" && (
                    <BlurFade key={`qa-${selectedDocId}`} className="qa-thread" duration={0.22} offset={4}>
                      {qaThread.map((turn) => (
                        <React.Fragment key={turn.id}>
                          <div className="qa-user-row">
                            <span className="qa-user-avatar" aria-hidden="true">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2.2c-3.8 0-7.5 1.9-7.5 4.6V21h15v-2.2c0-2.7-3.7-4.6-7.5-4.6z" />
                              </svg>
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="qa-user-bubble">{turn.question}</div>
                              <div className="qa-sanitized-proof" title="Exact anonymized prompt transmitted to Cloud AI">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                                  <rect x="4" y="11" width="16" height="10" rx="2" />
                                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                                </svg>
                                <span>
                                  Sent to Cloud as: <code>{turn.sanitizedQuestion}</code>
                                </span>
                              </div>
                            </div>
                            <span className="qa-timestamp">{turn.timestamp}</span>
                          </div>

                          <div className="qa-ai-row">
                            <span className="qa-ai-avatar" aria-hidden="true">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                                <path d="M12 3l8 4v5.5c0 5-3.4 9-8 10.5-4.6-1.5-8-5.5-8-10.5V7l8-4z" />
                                <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
                              </svg>
                            </span>

                            <div className="qa-ai-card">
                              <div className="qa-ai-intro">{turn.intro}</div>

                              {turn.sections.map((sec, sIdx) => (
                                <div key={sIdx} className="qa-clause-block">
                                  <div className="qa-clause-title">{sec.heading}</div>
                                  <div className="qa-clause-body">
                                    {renderRestoredProse(sec.cloudBody)}
                                  </div>
                                </div>
                              ))}

                              <div className="qa-card-footer">
                                <button
                                  type="button"
                                  className="btn-outline-pill"
                                  onClick={() => handleCopySummary(turn)}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                                    <rect x="9" y="9" width="13" height="13" rx="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>
                                    {copiedId === turn.id ? "Copied Summary" : "Copy Safe Summary"}
                                  </span>
                                </button>
                                <span className="qa-timestamp">0 PII sent · {turn.timestamp}</span>
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                      {isAskingQa && (
                        <div style={{ fontSize: "12.5px", color: "var(--ink-500)", paddingLeft: "42px" }}>
                          Masking question locally &amp; analyzing anonymized context…
                        </div>
                      )}
                    </BlurFade>
                  )}

                  {/* Pinned Command Input Bar + Quick Prompt Chips */}
                  <div className="ask-dock">
                    <form
                      className={"ask-input-shell" + (askFocused || isAskingQa ? " focused" : "")}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleAskQuestion(questionDraft);
                      }}
                    >
                      {(askFocused || isAskingQa) && <BorderBeam size={56} duration={4.5} />}
                      <span className="ask-prompt-glyph mono" aria-hidden="true">›_</span>
                      <input
                        type="text"
                        className="ask-input"
                        placeholder="Query anonymized document…"
                        value={questionDraft}
                        onFocus={() => setAskFocused(true)}
                        onBlur={() => setAskFocused(false)}
                        onChange={(e) => setQuestionDraft(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="ask-send-btn"
                        aria-label="Send question"
                        disabled={isAskingQa}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </form>

                    <div className="prompt-chips-row">
                      {currentDocMeta.quickChips.map((chip) => (
                        <RippleButton
                          key={chip}
                          type="button"
                          className="prompt-chip"
                          onClick={() => void handleAskQuestion(chip)}
                        >
                          <span>{chip}</span>
                          <span className="chip-arrow" aria-hidden="true">↗</span>
                        </RippleButton>
                      ))}
                    </div>
                  </div>
                </div>
              </MagicCard>
            </main>
          )}

          {/* ==================== VIEW 1B: BATCH STUDIO (MULTI-FILE CORPUS & SHARED VAULT) ==================== */}
          {sidebarNav === "batch" && (
            <main className="workspace-split" aria-label="Multi-Document Batch De-Identification Studio">
              {/* LEFT PANEL: Packet Queue + File Preview + Cross-File Shared Entity Matrix */}
              <MagicCard className="glass-panel">
                <div className="card-tabbar">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                    <span className="vault-lock-badge" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <rect x="3" y="4" width="14" height="14" rx="2" />
                        <path d="M7 20h12a2 2 0 0 0 2-2V8" />
                      </svg>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink-900)" }}>
                        Packet Queue ({batchCorpusResult.files.length} Files)
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--ink-500)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {activeBatchPacket.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="strategy-seg" role="radiogroup" aria-label="Batch redaction output strategy">
                    <button
                      type="button"
                      className={"strategy-btn" + (batchStrategy === "smart_tokens" ? " active" : "")}
                      onClick={() => setBatchStrategy("smart_tokens")}
                    >
                      Tokens
                    </button>
                    <button
                      type="button"
                      className={"strategy-btn" + (batchStrategy === "synthetic_alias" ? " active" : "")}
                      onClick={() => setBatchStrategy("synthetic_alias")}
                    >
                      Synthetic
                    </button>
                    <button
                      type="button"
                      className={"strategy-btn" + (batchStrategy === "legal_blackout" ? " active" : "")}
                      onClick={() => setBatchStrategy("legal_blackout")}
                    >
                      Blackout
                    </button>
                  </div>
                </div>

                <div className="doc-sheet-wrap" style={{ overflowY: "auto" }}>
                  {/* Queued File Selector Cards */}
                  <div className="batch-files-grid">
                    {batchCorpusResult.files.map((bf) => {
                      const isSel = activeBatchFile?.id === bf.id;
                      const matchesHighlight =
                        batchHighlightToken &&
                        bf.fileEntities.some((e) => e.token === batchHighlightToken);
                      return (
                        <button
                          key={bf.id}
                          type="button"
                          className={
                            "batch-file-card" +
                            (isSel ? " active" : "") +
                            (matchesHighlight ? " linked" : "")
                          }
                          onClick={() => setSelectedBatchFileId(bf.id)}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                            <span className={`file-type-icon ${bf.ext}`}>
                              {bf.ext === "docx" ? "W" : "PDF"}
                            </span>
                            <span className="batch-verified-chip">✓ {bf.maskedCount} masked</span>
                          </div>
                          <div className="batch-file-name">{bf.fileName}</div>
                          <div className="batch-file-role">{bf.docRole} · 0 B leaked</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected File Preview Paper */}
                  {activeBatchFile && (
                    <div className="doc-paper" style={{ maxHeight: "235px", padding: "15px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--ink-900)" }}>
                            {activeBatchFile.fileName}
                          </div>
                          <div className="mono" style={{ fontSize: "11px", color: "var(--ink-400)" }}>
                            SHA-256 #{activeBatchFile.sha256.slice(0, 12).toUpperCase()}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div className="strategy-seg">
                            <button
                              type="button"
                              className={"strategy-btn" + (batchPreviewMode === "redacted" ? " active" : "")}
                              onClick={() => setBatchPreviewMode("redacted")}
                            >
                              Redacted
                            </button>
                            <button
                              type="button"
                              className={"strategy-btn" + (batchPreviewMode === "raw" ? " active" : "")}
                              onClick={() => setBatchPreviewMode("raw")}
                            >
                              Original
                            </button>
                          </div>
                          <button
                            type="button"
                            className="btn-outline-pill"
                            style={{ height: "28px", fontSize: "11.5px", padding: "0 10px" }}
                            onClick={() => handleOpenBatchFileInWorkspace(activeBatchFile)}
                          >
                            Open in Doc ›
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: "12.8px", lineHeight: 1.62, whiteSpace: "pre-wrap", color: "var(--ink-700)" }}>
                        {batchPreviewMode === "raw"
                          ? activeBatchFile.rawText
                          : transformSanitizedTextByStrategy(
                              activeBatchFile.sanitizedText,
                              batchSharedVaultEntries,
                              batchStrategy
                            )}
                      </div>
                    </div>
                  )}

                  {/* Cross-Document Shared Entity Vault */}
                  <div className="vault-subcard">
                    <div className="vault-subcard-header">
                      <div className="vault-subcard-title">
                        <span className="vault-lock-badge" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                        </span>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 700 }}>
                            Shared Cross-Document Vault ({batchCorpusResult.sharedVault.length} Unique · {batchCorpusResult.crossFileEntityCount} Multi-File)
                          </div>
                          <div style={{ fontSize: "11.2px", color: "var(--ink-500)" }}>
                            Same person/company gets the exact same token across every file · Hover to highlight files above
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ maxHeight: "185px", overflowY: "auto" }}>
                      <table className="vault-table">
                        <thead>
                          <tr>
                            <th>Original Entity</th>
                            <th>Shared Token / Alias</th>
                            <th>Files Linked</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchCorpusResult.sharedVault.map((sv, idx) => {
                            const asEntry = batchSharedVaultEntries[idx];
                            const color = getEntryPillColor(asEntry);
                            const outLabel = getStrategyDisplayForEntry(asEntry, idx, batchStrategy);
                            return (
                              <tr
                                key={sv.token}
                                className={batchHighlightToken === sv.token ? "vault-row-linked" : ""}
                                onMouseEnter={() => setBatchHighlightToken(sv.token)}
                                onMouseLeave={() => setBatchHighlightToken(null)}
                              >
                                <td style={{ fontWeight: 600 }}>
                                  {sv.category === "SSN"
                                    ? "***-**-" + sv.originalValue.slice(-4)
                                    : sv.originalValue}
                                </td>
                                <td>
                                  <span
                                    className={
                                      batchStrategy === "legal_blackout"
                                        ? "entity-pill blackout-pill"
                                        : `entity-pill ${batchStrategy === "smart_tokens" ? "token-mono " : ""}${color}`
                                    }
                                  >
                                    {outLabel}
                                  </span>
                                </td>
                                <td>
                                  <span className="cross-file-badge">
                                    {sv.fileIds.length}/{batchCorpusResult.files.length} files ({sv.totalOccurrences}×)
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="card-footer-strip">
                  <span>
                    <strong>{batchCorpusResult.totalMaskedInstances} PII spans</strong> linked across{" "}
                    <strong>{batchCorpusResult.files.length} files</strong> (0 raw PII bytes sent)
                  </span>
                  <button type="button" className="btn-primary-pill" onClick={handleExportBatchPdf}>
                    ↓ Export Packet PDF
                  </button>
                </div>
              </MagicCard>

              {/* RIGHT PANEL: Cross-Document Cloud Gemini 2.5 Synthesis */}
              <MagicCard className="glass-panel">
                <div className="card-tabbar">
                  <div className="card-tabs">
                    <span className="card-tab active">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="18" r="3" />
                        <circle cx="6" cy="6" r="3" />
                        <path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12" />
                      </svg>
                      <span>Cross-Packet Reconciliation</span>
                      <span className="card-tab-indicator" />
                    </span>
                  </div>
                  <div className="tab-controls-right">
                    <button
                      type="button"
                      className="btn-outline-pill"
                      style={{ height: "26px", fontSize: "11px", padding: "0 9px" }}
                      onClick={() => setRehydrateRight((v) => !v)}
                    >
                      {rehydrateRight ? "Restored Names" : "Cloud Tokens"}
                    </button>
                  </div>
                </div>

                <div className="right-panel-body">
                  <div className="insights-stack">
                    <h2 className="section-h3">{activeBatchPacket.crossDocSynthesisTitle}</h2>

                    <div className="summary-prose">
                      {rehydrateRight
                        ? replaceTokensWithValues(
                            activeBatchPacket.crossDocSynthesisSummary,
                            batchSharedVaultEntries,
                            new Set()
                          )
                        : activeBatchPacket.crossDocSynthesisSummary}
                    </div>

                    <div className="kpi-cards-grid">
                      <div className="kpi-insight-card">
                        <span className="kpi-icon-circle blue" aria-hidden="true">✓</span>
                        <span className="kpi-card-label">Packet Scope</span>
                        <span className="kpi-card-value">{batchCorpusResult.files.length} Records</span>
                        <span className="kpi-card-sub">{batchCorpusResult.totalMaskedInstances} Spans Masked</span>
                      </div>
                      <div className="kpi-insight-card">
                        <span className="kpi-icon-circle purple" aria-hidden="true">⇄</span>
                        <span className="kpi-card-label">Shared Entities</span>
                        <span className="kpi-card-value">{batchCorpusResult.crossFileEntityCount} Linked</span>
                        <span className="kpi-card-sub">Consistent Coreference</span>
                      </div>
                      <div className="kpi-insight-card">
                        <span className="kpi-icon-circle green" aria-hidden="true">0</span>
                        <span className="kpi-card-label">Cloud Exposure</span>
                        <span className="kpi-card-value">0 Bytes</span>
                        <span className="kpi-card-sub">#{batchCorpusResult.batchManifestSha256.slice(0, 8).toUpperCase()}</span>
                      </div>
                    </div>

                    <div className="restored-banner">
                      <span className="check-circle-green" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      <span>
                        Cross-file risks detected because shared tokens preserved identity across all {batchCorpusResult.files.length} documents.
                      </span>
                    </div>

                    <h3 className="section-h3">Cross-Document Findings &amp; Mismatches</h3>
                    <div className="next-steps-list">
                      {activeBatchPacket.crossDocAlerts.map((al, i) => {
                        const titleTxt = rehydrateRight
                          ? replaceTokensWithValues(al.title, batchSharedVaultEntries, new Set())
                          : al.title;
                        const detailTxt = rehydrateRight
                          ? replaceTokensWithValues(al.detail, batchSharedVaultEntries, new Set())
                          : al.detail;
                        return (
                          <div key={i} className="batch-finding-card">
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                              <span className={`severity-tag ${al.severity.toLowerCase()}`}>
                                {al.severity}
                              </span>
                              <strong style={{ fontSize: "13px", color: "var(--ink-900)" }}>
                                {titleTxt}
                              </strong>
                            </div>
                            <div style={{ fontSize: "12.8px", color: "var(--ink-700)", lineHeight: 1.55 }}>
                              {detailTxt}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </MagicCard>
            </main>
          )}

          {/* ==================== VIEW 1C: PROMPT FIREWALL & SAFE AI COMPOSER ==================== */}
          {sidebarNav === "firewall" && (
            <main className="workspace-split" aria-label="Outbound AI Prompt Firewall and Safe Composer">
              {/* LEFT PANEL: Compliance Policy Builder + Live As-You-Type Firewall */}
              <MagicCard className="glass-panel">
                <div className="card-tabbar">
                  <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <span className="vault-lock-badge" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                      </svg>
                    </span>
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 700 }}>
                        Live Outbound AI Firewall
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--ink-500)" }}>
                        Intercepts PII in emails, notes &amp; prompts before reaching Cloud LLMs
                      </div>
                    </div>
                  </div>

                  <div className="strategy-seg" role="radiogroup" aria-label="Firewall enforcement mode">
                    <button
                      type="button"
                      className={"strategy-btn" + (firewallEnforcement === "auto_mask" ? " active" : "")}
                      onClick={() => setFirewallEnforcement("auto_mask")}
                    >
                      Auto-Mask
                    </button>
                    <button
                      type="button"
                      className={"strategy-btn" + (firewallEnforcement === "strict_block" ? " active" : "")}
                      onClick={() => setFirewallEnforcement("strict_block")}
                    >
                      Strict Block
                    </button>
                  </div>
                </div>

                <div className="doc-sheet-wrap" style={{ overflowY: "auto" }}>
                  {/* Compliance Profile Pills */}
                  <div>
                    <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--ink-500)", marginBottom: "6px" }}>
                      Compliance Policy Profile ({COMPLIANCE_PROFILES[firewallProfile].badge}):
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                      {(Object.keys(COMPLIANCE_PROFILES) as ComplianceProfileId[]).map((pid) => (
                        <button
                          key={pid}
                          type="button"
                          className={firewallProfile === pid ? "btn-primary-pill" : "btn-outline-pill"}
                          style={{ height: "28px", fontSize: "11.5px", padding: "0 11px" }}
                          onClick={() => handleSelectFirewallProfile(pid)}
                        >
                          {COMPLIANCE_PROFILES[pid].label}
                        </button>
                      ))}
                    </div>

                    {/* Granular Rule Category Toggles */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {FIREWALL_CATEGORY_GROUPS.map((grp) => {
                        const on = firewallGroups.includes(grp.id);
                        return (
                          <button
                            key={grp.id}
                            type="button"
                            className={"policy-toggle-chip" + (on ? " on" : "")}
                            onClick={() => handleToggleFirewallGroup(grp.id)}
                          >
                            <span>{on ? "✓" : "○"}</span>
                            <span>{grp.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Raw Prompt Editor */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "8px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-900)" }}>
                        1. Raw Outbound Prompt / Email Draft (Device RAM Only)
                      </label>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
                        <AnimatedCircularProgressBar
                          value={firewallEval.rawRiskScore}
                          size={32}
                          strokeWidth={10}
                          gaugePrimaryColor="#e11d48"
                        />
                        <span className="risk-pill raw">
                          Raw Risk: {firewallEval.rawRiskScore}/100
                        </span>
                      </div>
                    </div>
                    <textarea
                      className="doc-textarea"
                      style={{ minHeight: "130px", fontSize: "13px" }}
                      value={firewallRawPrompt}
                      onChange={(e) => setFirewallRawPrompt(e.target.value)}
                    />
                  </div>

                  {/* Sanitized Cloud Payload Preview */}
                  <div className="vault-subcard" style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-900)" }}>
                        2. Exact Payload Allowed Through Firewall
                      </span>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
                        <AnimatedCircularProgressBar
                          value={100 - firewallEval.postScrubRiskScore}
                          size={32}
                          strokeWidth={10}
                          gaugePrimaryColor="#10b981"
                        />
                        <span className={"risk-pill " + (firewallEval.postScrubRiskScore === 0 ? "safe" : "raw")}>
                          Exposure: {firewallEval.postScrubRiskScore}/100
                        </span>
                      </div>
                    </div>
                    <div className="firewall-safe-box">
                      {firewallEval.sanitizedPrompt}
                    </div>
                  </div>
                </div>

                <div className="card-footer-strip">
                  <span>
                    <strong>{firewallEval.suppressedCount} spans</strong> intercepted locally · Receipt #{firewallEval.sha256Short}
                  </span>
                  <button
                    type="button"
                    className="btn-outline-pill"
                    style={{ height: "28px", fontSize: "11.5px" }}
                    onClick={() => {
                      if (navigator.clipboard) void navigator.clipboard.writeText(firewallEval.sanitizedPrompt);
                      setCopiedId("fw-masked");
                      setTimeout(() => setCopiedId(null), 1600);
                    }}
                  >
                    {copiedId === "fw-masked" ? "✓ Copied Masked Prompt" : "Copy Masked Prompt"}
                  </button>
                </div>
              </MagicCard>

              {/* RIGHT PANEL: Safe Cloud AI Rewrite & Task Composer */}
              <MagicCard className="glass-panel">
                <div className="card-tabbar">
                  <div className="card-tabs">
                    <span className="card-tab active">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      <span>Safe Cloud AI Composer</span>
                      <span className="card-tab-indicator" />
                    </span>
                  </div>
                  <div className="tab-controls-right">
                    <button
                      type="button"
                      className="btn-outline-pill"
                      style={{ height: "26px", fontSize: "11px", padding: "0 9px" }}
                      onClick={() => setFirewallShowRestored((v) => !v)}
                    >
                      {firewallShowRestored ? "Restored Names" : "Cloud Tokens"}
                    </button>
                  </div>
                </div>

                <div className="right-panel-body">
                  <div className="insights-stack">
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-500)", marginBottom: "7px" }}>
                        Select Cloud Gemini 2.5 Task (runs on anonymized prompt only):
                      </div>
                      <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                        {([
                          ["polish_email", "Polish Professional Draft"],
                          ["extract_actions", "Extract Action Checklist"],
                          ["patient_plain_language", "Plain-Language Summary"],
                          ["spanish_translation", "Spanish Translation"]
                        ] as Array<[FirewallActionTask, string]>).map(([tid, tlabel]) => (
                          <button
                            key={tid}
                            type="button"
                            className={firewallTask === tid ? "btn-primary-pill" : "btn-outline-pill"}
                            style={{ height: "30px", fontSize: "12px" }}
                            onClick={() => setFirewallTask(tid)}
                          >
                            {tlabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    {firewallEnforcement === "strict_block" && firewallEval.rawRiskScore > 0 ? (
                      <div className="leak-banner" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        <div className="leak-banner-title">
                          Strict Block Policy Triggered — Outbound Cloud Call Blocked
                        </div>
                        <div className="leak-banner-desc">
                          Prompt Firewall detected {firewallEval.suppressedCount} regulated identifiers (Raw Risk {firewallEval.rawRiskScore}/100). Under <strong>Strict Block</strong> mode, network transmission is denied until identifiers are removed or mode is switched back to <strong>Auto-Mask</strong>.
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="doc-paper" style={{ maxHeight: "none" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px", flexWrap: "wrap" }}>
                            <h3 className="section-h3">{firewallRewrite.taskTitle}</h3>
                            <span className="offline-mode-tag">
                              {firewallShowRestored ? "Restored in RAM" : "Raw Cloud Return"}
                            </span>
                          </div>
                          <div style={{ fontSize: "13.5px", lineHeight: 1.66, whiteSpace: "pre-wrap", color: "var(--ink-800)" }}>
                            {firewallShowRestored
                              ? firewallRewrite.rehydratedOutput
                              : firewallRewrite.cloudOutputWithTokens}
                          </div>
                        </div>

                        <div className="restored-banner">
                          <span className="check-circle-green" aria-hidden="true">✓</span>
                          <span>
                            Gemini 2.5 Flash generated this draft using only <code>[PII_*]</code> placeholders; real names were restored on your device.
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="ask-dock" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", color: "var(--ink-500)" }}>
                      Policy: <strong>{COMPLIANCE_PROFILES[firewallProfile].label}</strong>
                    </span>
                    <button
                      type="button"
                      className="btn-primary-pill"
                      disabled={firewallEnforcement === "strict_block" && firewallEval.rawRiskScore > 0}
                      onClick={() => {
                        const out = firewallShowRestored
                          ? firewallRewrite.rehydratedOutput
                          : firewallRewrite.cloudOutputWithTokens;
                        if (navigator.clipboard) void navigator.clipboard.writeText(out);
                        setCopiedId("fw-out");
                        setTimeout(() => setCopiedId(null), 1600);
                      }}
                    >
                      {copiedId === "fw-out" ? "✓ Copied Safe Draft" : "Copy Generated Draft"}
                    </button>
                  </div>
                </div>
              </MagicCard>
            </main>
          )}

          {/* ==================== VIEW 2: HOME DASHBOARD ==================== */}
          {sidebarNav === "home" && (
            <main className="home-dashboard" aria-label="PII-Zero Home Overview">
              <section className="home-hero-card">
                <GlyphMatrix
                  cellSize={14}
                  color="#10b981"
                  fadeBottom={0.4}
                  className="home-hero-glyphs"
                />
                <BorderBeam size={96} duration={8} />
                <div className="home-hero-left">
                  <span className="home-big-check" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <div>
                    <h1 style={{ fontFamily: "var(--font-display)", fontSize: "21px", fontWeight: 800, marginBottom: "4px" }}>
                      <DiaTextReveal text="Zero-Trust Hybrid AI Enclave" duration={0.85} />
                    </h1>
                    <p style={{ fontSize: "14px", color: "var(--ink-700)", marginBottom: "12px" }}>
                      Personal, medical, and legal identifiers are masked locally on your device with Gemini Nano + our 18-category HIPAA enclave before Cloud AI ever sees a word.
                    </p>
                    <InteractiveHoverButton
                      type="button"
                      onClick={() => setSidebarNav("document")}
                    >
                      Open Active Workspace
                    </InteractiveHoverButton>
                  </div>
                </div>
              </section>

              <section className="home-activity-card">
                <div className="section-heading-row" style={{ marginBottom: "10px" }}>
                  <h2 className="section-h3">Recent Activity &amp; Sample Documents</h2>
                  <span style={{ fontSize: "12.5px", color: "var(--ink-500)" }}>Click any document to inspect</span>
                </div>

                <div>
                  {Object.values(WORKSPACE_DOCS).map((meta) => (
                    <div
                      key={meta.id}
                      className="activity-row"
                      onClick={() => handleSelectPresetDoc(meta.id)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span className={`file-type-icon ${meta.ext}`}>
                          {meta.ext === "docx" ? "W" : "PDF"}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "13.5px" }}>{meta.fileName}</div>
                          <div style={{ fontSize: "12px", color: "var(--ink-500)" }}>
                            Analyzed • 0 PII exposed • {meta.instTitle}
                          </div>
                        </div>
                      </div>
                      <span className="btn-outline-pill">Open →</span>
                    </div>
                  ))}
                </div>
              </section>

              <div>
                <h2 className="section-h3" style={{ marginBottom: "10px" }}>Quick Actions</h2>
                <div className="quick-actions-grid">
                  <button
                    type="button"
                    className="quick-action-btn"
                    onClick={() => setUploadModalOpen(true)}
                  >
                    <span className="kpi-icon-circle blue" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                        <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
                      </svg>
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>Upload / Paste Document</div>
                      <div style={{ fontSize: "12px", color: "var(--ink-500)" }}>Analyze your own confidential note</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="quick-action-btn"
                    onClick={() => {
                      setSidebarNav("document");
                      setRightTab("qa");
                    }}
                  >
                    <span className="kpi-icon-circle purple" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
                      </svg>
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>Ask a Question (AI Assistant)</div>
                      <div style={{ fontSize: "12px", color: "var(--ink-500)" }}>Zero-PII clause &amp; clinical Q&amp;A</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="quick-action-btn"
                    onClick={() => {
                      setSidebarNav("document");
                      setLeftTab("audit");
                      handleSimulateLeakAttempt();
                    }}
                  >
                    <span className="kpi-icon-circle green" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>Test Pre-Send Leak Blocker</div>
                      <div style={{ fontSize: "12px", color: "var(--ink-500)" }}>Verify raw SSNs are hard-blocked</div>
                    </div>
                  </button>
                </div>
              </div>
            </main>
          )}

          {/* ==================== VIEW 3: HISTORY & ZERO-PII RECEIPTS ==================== */}
          {sidebarNav === "history" && (
            <section className="home-activity-card" aria-label="Zero-PII session audit history">
              <div className="section-heading-row" style={{ marginBottom: "12px" }}>
                <div>
                  <h2 className="section-h3">Session Zero-PII Audit Receipts</h2>
                  <p style={{ fontSize: "12.5px", color: "var(--ink-500)", marginTop: "2px" }}>
                    Cryptographic SHA-256 verification log for documents analyzed in this browser tab (0 raw PII bytes transmitted).
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-outline-pill"
                  onClick={() => setSidebarNav("document")}
                >
                  Back to Workspace
                </button>
              </div>

              <div className="table-responsive-scroll">
                <table className="vault-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Masked Locally</th>
                      <th>Cloud PII Bytes</th>
                      <th>SHA-256 Receipt</th>
                      <th>Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditHistory.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{item.fileName}</td>
                        <td>{item.maskedCount} entities</td>
                        <td style={{ color: "#15803d", fontWeight: 700 }}>0 B</td>
                        <td className="mono">#{item.sha256Short}</td>
                        <td style={{ color: "var(--ink-500)" }}>{item.whenLabel}</td>
                        <td>
                          <button
                            type="button"
                            className="footer-link-btn"
                            onClick={() => handleSelectPresetDoc(item.presetId)}
                          >
                            Open ›
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ==================== VIEW 4: SETTINGS & FIREBASE HYBRID SDK ==================== */}
          {sidebarNav === "settings" && (
            <div className="home-dashboard">
              <section className="home-activity-card">
                <div className="section-heading-row" style={{ marginBottom: "14px" }}>
                  <div>
                    <h2 className="section-h3">Hybrid Inference Policy &amp; Enclave Isolation</h2>
                    <p style={{ fontSize: "12.5px", color: "var(--ink-500)", marginTop: "2px" }}>
                      Configure Stage 1 on-device inference mode and custom local redaction terms. Zero API keys, tokens, or secrets are rendered or editable in the browser GUI.
                    </p>
                  </div>
                  <span className="offline-mode-tag">0 Secrets in GUI</span>
                </div>

                <div className="kpi-cards-grid" style={{ marginBottom: "14px" }}>
                  <GlareHover className="kpi-insight-card">
                    <span className="kpi-card-label mono">GUI Credential Surface</span>
                    <span className="kpi-card-value" style={{ color: "#059669" }}>0 Keys Exposed</span>
                    <span className="kpi-card-sub">No API keys or tokens in DOM</span>
                  </GlareHover>
                  <GlareHover className="kpi-insight-card">
                    <span className="kpi-card-label mono">App Check Debug Token</span>
                    <span className="kpi-card-value">Stripped</span>
                    <span className="kpi-card-sub">Hard-disabled in web client</span>
                  </GlareHover>
                  <GlareHover className="kpi-insight-card">
                    <span className="kpi-card-label mono">Runtime Binding</span>
                    <span className="kpi-card-value">{liveFirebase ? "Env-Bound" : "Local Sandbox"}</span>
                    <span className="kpi-card-sub">Strict origin &amp; App Check</span>
                  </GlareHover>
                </div>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>Stage 1 Mode (firebase/ai):</span>
                  <button
                    type="button"
                    className={stage1Mode === InferenceMode.ONLY_ON_DEVICE ? "btn-primary-pill" : "btn-outline-pill"}
                    onClick={() => setStage1Mode(InferenceMode.ONLY_ON_DEVICE)}
                  >
                    InferenceMode.ONLY_ON_DEVICE (Gemini Nano)
                  </button>
                  <button
                    type="button"
                    className={stage1Mode === InferenceMode.PREFER_ON_DEVICE ? "btn-primary-pill" : "btn-outline-pill"}
                    onClick={() => setStage1Mode(InferenceMode.PREFER_ON_DEVICE)}
                  >
                    InferenceMode.PREFER_ON_DEVICE (Airlock Pinned)
                  </button>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, marginBottom: "5px" }}>
                    Custom Company / Project Codewords to Mask Locally (comma-separated):
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    value={customTermsInput}
                    onChange={(e) => setCustomTermsInput(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <InteractiveHoverButton type="button" onClick={handleSaveFirebaseSettings}>
                    Apply Policy &amp; Re-Analyze
                  </InteractiveHoverButton>
                  <input
                    type="text"
                    className="text-input mono"
                    style={{ width: "210px", maxWidth: "100%" }}
                    value={cloudModelName}
                    onChange={(e) => setCloudModelName(e.target.value)}
                    aria-label="Cloud Gemini model name"
                  />
                </div>
              </section>

              <section className="home-activity-card">
                <div className="section-heading-row" style={{ marginBottom: "12px" }}>
                  <div>
                    <h2 className="section-h3">Architecture Diff &amp; Official SDK Integration</h2>
                    <p style={{ fontSize: "12px", color: "var(--ink-500)", marginTop: "2px" }}>
                      Why raw cloud SDK calls violate HIPAA/privilege vs. PII-Zero’s 3-stage local-first airlock.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className={sdkLang === "ts" ? "btn-primary-pill" : "btn-outline-pill"}
                      onClick={() => setSdkLang("ts")}
                    >
                      Web (firebase/ai)
                    </button>
                    <button
                      type="button"
                      className={sdkLang === "kotlin" ? "btn-primary-pill" : "btn-outline-pill"}
                      onClick={() => setSdkLang("kotlin")}
                    >
                      Android (Kotlin)
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <CodeComparison
                    filename="hybridAirlock.ts"
                    beforeLines={[
                      { text: "const cloud = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });" },
                      { text: "// DANGER: Transmits raw patient SSN, MRN & names to cloud!", kind: "remove" },
                      { text: "const res = await cloud.generateContent(rawMedicalChart);", kind: "remove" },
                      { text: "return res.response.text();" }
                    ]}
                    afterLines={[
                      { text: "const nano = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });", kind: "add" },
                      { text: "const { sanitizedText, vault } = await scrubLocally(nano, rawChart);", kind: "add" },
                      { text: "assertZeroPiiLeak(sanitizedText, vault); // 0 raw PII bytes", kind: "add" },
                      { text: "const res = await cloud.generateContent(sanitizedText);" },
                      { text: "return rehydrateInRam(res.response.text(), vault);", kind: "add" }
                    ]}
                  />
                </div>

                <pre className="code-block">
                  {sdkLang === "ts" ? generateSdkCodeSnippet(stage1Mode, cloudModelName) : KOTLIN_SDK_SNIPPET}
                </pre>
              </section>
            </div>
          )}

          {/* ==================== VIEW 5: HELP & COMPANION APPS ==================== */}
          {sidebarNav === "help" && (
            <div className="home-dashboard">
              <div className="two-col-cards">
                <section className="home-activity-card">
                  <div className="section-heading-row" style={{ marginBottom: "12px" }}>
                    <div>
                      <h2 className="section-h3">Chrome Side Panel Extension (MV3)</h2>
                      <p style={{ fontSize: "12.5px", color: "var(--ink-500)", marginTop: "2px" }}>
                        Scrub sensitive text directly inside any hospital EHR or legal web portal before pasting into AI tools.
                      </p>
                    </div>
                    <a className="btn-primary-pill" href="/downloads/piizero-chrome-extension.zip" download>
                      ↓ Download .zip
                    </a>
                  </div>

                  <SafariMockup url="ehr.riverside-medical.org · PII-Zero MV3 Side Panel">
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--ink-500)", marginBottom: "6px" }} className="mono">
                      SIDE PANEL LIVE REDACTION PREVIEW
                    </div>
                    <div style={{ fontSize: "12.5px", lineHeight: 1.6 }}>
                      {renderTokenPillsInText((pipelineResult?.scrubResult.sanitizedText ?? "").slice(0, 290) + "…")}
                    </div>
                  </SafariMockup>
                </section>

                <section className="home-activity-card">
                  <div className="section-heading-row" style={{ marginBottom: "12px" }}>
                    <div>
                      <h2 className="section-h3">Android &amp; Galaxy Z Fold7 Dual-Screen App</h2>
                      <p style={{ fontSize: "12.5px", color: "var(--ink-500)", marginTop: "2px" }}>
                        Jetpack Compose + WindowManager FoldingFeature + com.google.firebase:firebase-ai.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="btn-outline-pill"
                        onClick={() => setFoldPosture((p) => (p === "unfolded" ? "cover" : "unfolded"))}
                      >
                        {foldPosture === "unfolded" ? "Switch to Cover" : "Switch to Unfolded"}
                      </button>
                      <a className="btn-primary-pill" href="/downloads/piizero-android-debug.apk" download>
                        ↓ Download .apk
                      </a>
                    </div>
                  </div>

                  <AndroidMockup unfolded={foldPosture === "unfolded"}>
                    {foldPosture === "unfolded" ? (
                      <div className="fold-dual">
                        <div style={{ fontSize: "12px", lineHeight: 1.55, paddingRight: "6px" }}>
                          <div className="mono" style={{ fontWeight: 700, fontSize: "10.5px", color: "var(--accent-cobalt)", marginBottom: "6px" }}>
                            LEFT SCREEN · LOCAL RAM VAULT
                          </div>
                          {rawText.slice(0, 200)}…
                        </div>
                        <div className="fold-hinge" title="Galaxy Z Fold7 Hinge" />
                        <div style={{ fontSize: "12px", lineHeight: 1.55, paddingLeft: "6px" }}>
                          <div className="mono" style={{ fontWeight: 700, fontSize: "10.5px", color: "#059669", marginBottom: "6px" }}>
                            RIGHT SCREEN · RESTORED REVIEW
                          </div>
                          {renderRestoredProse((analysis?.executiveSummary ?? "").slice(0, 210))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mono" style={{ fontWeight: 700, fontSize: "11px", marginBottom: "6px", color: "#059669" }}>
                          COVER MODE · 0 B PII EGRESS
                        </div>
                        <div style={{ fontSize: "12px", lineHeight: 1.55 }}>
                          {renderRestoredProse(analysis?.executiveSummary ?? "")}
                        </div>
                      </div>
                    )}
                  </AndroidMockup>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload / Paste Document Modal */}
      <AnimatePresence>
        {uploadModalOpen && (
          <motion.div
            key="upload-modal"
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Upload or paste confidential document"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="modal-card"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
            <div className="section-heading-row">
              <div>
                <h2 className="section-h3">Load or Paste Confidential Document</h2>
                <p style={{ fontSize: "12.5px", color: "var(--ink-500)", marginTop: "2px" }}>
                  Processed 100% in local browser memory before any anonymized prompt is sent to Cloud AI.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline-pill"
                onClick={() => setUploadModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-500)", marginBottom: "6px" }}>
                Or open a built-in medical / legal test record:
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {Object.values(WORKSPACE_DOCS).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="prompt-chip"
                    onClick={() => {
                      setUploadModalOpen(false);
                      handleSelectPresetDoc(m.id);
                    }}
                  >
                    {m.fileName}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={"dropzone-box" + (isDragOverModal ? " dragover" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOverModal(true);
              }}
              onDragLeave={() => setIsDragOverModal(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOverModal(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) void processUploadedClientFile(dropped);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,.json,.log"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--ink-900)" }}>
                Drop a .PDF, .DOCX, or .TXT file here — or click to browse
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--ink-500)", marginTop: "2px" }}>
                Parsed 100% in local browser RAM (DecompressionStream / PDF text parser · 0 bytes uploaded)
              </div>
              {uploadStatusNote && (
                <div className="upload-status-note">{uploadStatusNote}</div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                className="text-input"
                style={{ flex: "1 1 200px" }}
                placeholder="Document tab title (e.g. Patient_Discharge.pdf)"
                value={pasteDraftTitle}
                onChange={(e) => setPasteDraftTitle(e.target.value)}
              />
            </div>

            <textarea
              className="doc-textarea"
              placeholder="Paste any medical chart, NDA, legal contract, or clinical note containing names, SSNs, dates, or dollar amounts..."
              value={pasteDraftBody}
              onChange={(e) => setPasteDraftBody(e.target.value)}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn-outline-pill"
                onClick={() => setUploadModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-pill"
                onClick={handleLoadCustomDocument}
              >
                Mask Locally &amp; Analyze
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

