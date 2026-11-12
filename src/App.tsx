import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BorderBeam,
  MagicCard,
  BlurFade,
  HyperText,
  NumberTicker,
  AnimatedThemeToggler,
  GlyphMatrix,
  DiaTextReveal,
  GlareHover,
  RippleButton,
  InteractiveHoverButton,
  AnimatedCircularProgressBar,
  Terminal,
  TypingAnimation,
  AnimatedSpan,
  CodeComparison,
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
      <defs>
        <linearGradient id="pzShieldFill" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#0d3b66" />
        </linearGradient>
        <linearGradient id="pzShieldStroke" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path
        d="M20 4L33 9.2v9.6c0 8.2-5.5 15.1-13 17.2C12.5 33.9 7 27 7 18.8V9.2L20 4z"
        fill="url(#pzShieldFill)"
        stroke="url(#pzShieldStroke)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <rect x="14.5" y="17.5" width="11" height="8.5" rx="2" fill="#081426" stroke="#38bdf8" strokeWidth="1.7" />
      <path d="M16.8 17.5V15a3.2 3.2 0 0 1 6.4 0v2.5" stroke="#34d399" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="20" cy="21.5" r="1.3" fill="#34d399" />
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [batchVaultExpanded, setBatchVaultExpanded] = useState<boolean>(false);
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

    const renderSectionIcon = (headingText: string) => {
      const h = headingText.toLowerCase();
      if (h.includes("visit") || h.includes("summary") || h.includes("clinical")) {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2.2" aria-hidden="true">
            <path d="M5 20v-6M11 20V9M17 20V4" strokeLinecap="round" />
          </svg>
        );
      }
      if (h.includes("treatment") || h.includes("plan") || h.includes("clause") || h.includes("obligation")) {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2" aria-hidden="true">
            <rect x="4" y="3" width="16" height="18" rx="2.5" />
            <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
          </svg>
        );
      }
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2.5" />
          <path d="M8 2v4M16 2v4M3 9h18" strokeLinecap="round" />
        </svg>
      );
    };

    return (
      <div
        className={mode === "redacted" ? "doc-paper compact" : "doc-paper"}
        onMouseUp={mode === "raw" ? handleCaptureDocumentSelection : undefined}
        onKeyUp={mode === "raw" ? handleCaptureDocumentSelection : undefined}
      >
        <div key={scanPulseKey} className="enclave-scanline" aria-hidden="true" />
        {currentDocMeta.showInstHeader && (
          <div className="doc-patient-section">
            <div className="doc-section-title-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2.2c-3.8 0-7.5 1.9-7.5 4.6V21h15v-2.2c0-2.7-3.7-4.6-7.5-4.6z" />
              </svg>
              <span>{currentDocMeta.isLegal ? "Counterparty & Counsel" : "Patient Information"}</span>
            </div>
            <div className="doc-inst-header">
              <div className="doc-avatar-circle" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2.2c-3.8 0-7.5 1.9-7.5 4.6V21h15v-2.2c0-2.7-3.7-4.6-7.5-4.6z" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="doc-inst-name">{currentDocMeta.instTitle}</div>
                <div className="doc-inst-sub">{currentDocMeta.instSub}</div>
              </div>
              <span className="doc-enclave-stamp mono">
                {mode === "raw" ? "LOCAL RAM" : "SCRUBBED"}
              </span>
            </div>
          </div>
        )}

        <div className="doc-section-title-row" style={{ marginBottom: "10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="17" rx="2.5" />
            <path d="M8 2v4M16 2v4M3 9h18" strokeLinecap="round" />
          </svg>
          <span>{currentDocMeta.isLegal ? "Agreement Details" : "Report Details"}</span>
        </div>

        {blocks.map((blk, bIdx) => {
          if (blk.kind === "divider") {
            return <div key={bIdx} className="doc-section-divider" />;
          }
          if (blk.kind === "heading") {
            return (
              <h3 key={bIdx} className="doc-section-heading">
                {renderSectionIcon(blk.text)}
                <span>{blk.text}</span>
              </h3>
            );
          }
          if (blk.kind === "kv") {
            const isProviderVisitPair =
              blk.items.length === 2 &&
              /provider|counsel|party/i.test(blk.items[0].label) &&
              /date|effective|visit/i.test(blk.items[1].label);

            if (isProviderVisitPair) {
              return (
                <div key={bIdx} className="doc-provider-split-row">
                  <div className="doc-provider-cell">
                    <span className="doc-provider-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                        <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
                        <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
                        <circle cx="20" cy="10" r="2" />
                      </svg>
                    </span>
                    <div>
                      <div className="doc-provider-label">{blk.items[0].label.replace(/:$/, "")}</div>
                      <div className="doc-provider-val">
                        {renderInline(blk.items[0].val, `kv-${bIdx}-0`)}
                      </div>
                    </div>
                  </div>

                  <div className="doc-provider-cell">
                    <span className="doc-provider-icon" aria-hidden="true">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="17" rx="2.5" />
                        <path d="M8 2v4M16 2v4M3 9h18" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div>
                      <div className="doc-provider-label">{blk.items[1].label.replace(/:$/, "")}</div>
                      <div className="doc-provider-val">
                        {renderInline(blk.items[1].val, `kv-${bIdx}-1`)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={bIdx} className="doc-kv-grid">
                {blk.items.map((kv, kIdx) => (
                  <React.Fragment key={kIdx}>
                    <div className="doc-kv-label">{kv.label.replace(/:$/, "")}</div>
                    <div>{renderInline(kv.val, `kv-${bIdx}-${kIdx}`)}</div>
                  </React.Fragment>
                ))}
              </div>
            );
          }
          if (blk.kind === "bullets") {
            return (
              <ul key={bIdx} className="doc-check-list">
                {blk.items.map((item, iIdx) => (
                  <li key={iIdx} className="doc-check-item">
                    <span className="doc-green-check" aria-hidden="true">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>{renderInline(item, `li-${bIdx}-${iIdx}`)}</span>
                  </li>
                ))}
              </ul>
            );
          }
          const sentences = blk.text.split(/(?<=\.)\s+(?=Recommended\b)/);
          if (sentences.length === 2) {
            return (
              <div key={bIdx}>
                <p className="doc-paragraph">{renderInline(sentences[0], `p-${bIdx}-a`)}</p>
                <div className="doc-inline-check-callout">
                  <span className="doc-green-check" aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>{renderInline(sentences[1].replace(/\.$/, ""), `p-${bIdx}-b`)}</span>
                </div>
              </div>
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
      <div className="pz-shell">
        {/* Top Dark Navy Global Header Bar (Matches Reference Pictures 1, 2 & 3) */}
        <header className="pz-global-navbar">
          <div className="pz-navbar-left">
            <button
              type="button"
              className="brand-lockup"
              title="Toggle Workspace / Overview"
              onClick={() => setSidebarNav((prev) => (prev === "document" ? "home" : "document"))}
            >
              <ShieldSparkleLogo />
              <span className="brand-wordmark">PII-Zero</span>
            </button>
          </div>

          <div className="pz-navbar-center">
            <div className="pz-search-pill">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                className="pz-search-input"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    if (q.includes("nda") || q.includes("contract") || q.includes("legal")) {
                      handleSelectPresetDoc("doc-nda-contract");
                    } else if (q.includes("batch") || q.includes("cardio") || q.includes("packet")) {
                      setSidebarNav("batch");
                    } else if (q.includes("app") || q.includes("chrome") || q.includes("android")) {
                      setSidebarNav("help");
                    } else {
                      handleSelectPresetDoc("doc-medical-record");
                    }
                  }
                }}
              />
            </div>
          </div>

          <div className="pz-navbar-right">
            <AnimatedThemeToggler
              theme={uiTheme}
              onThemeChange={setUiTheme}
              className="navbar-icon-btn"
            />
            <button
              type="button"
              className="navbar-bell-btn"
              title="Zero-Trust Audit & System Notifications"
              onClick={() => setSidebarNav("history")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className="navbar-profile-btn"
              title="Gilbert De Leon · Enclave Admin"
              onClick={() => setSidebarNav("settings")}
            >
              <span className="navbar-avatar-circle">GD</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="pz-body-frame">
          {/* Dark Navy Left Navigation Rail with Bottom System Operational Sparkline Card */}
          <aside className="pz-sidebar" aria-label="Primary navigation">
            <nav className="sidebar-nav">
              {(
                [
                  {
                    id: "document" as SidebarNav,
                    label: "Documents",
                    compact: "Documents",
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M8 13h8M8 17h5" />
                      </svg>
                    )
                  },
                  {
                    id: "batch" as SidebarNav,
                    label: "Batch",
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
                    label: "Firewall",
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
                    label: "Audit Log",
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
                    label: "SDK",
                    compact: "SDK",
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" strokeLinecap="round" />
                      </svg>
                    )
                  },
                  {
                    id: "help" as SidebarNav,
                    label: "Apps",
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
                      <span>{navItem.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="sidebar-bottom">
              <div className="sidebar-operational-card" title={`SHA-256 #${shortSha || "VERIFIED"} · 0 B PII Egress`}>
                <div className="sidebar-op-top">
                  <span className="live-emerald-dot" />
                  <div className="sidebar-op-title">
                    System
                    <br />
                    Operational
                  </div>
                </div>
                <svg className="sidebar-sparkline" viewBox="0 0 140 34" fill="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M2 26 C 18 26, 24 17, 38 19 C 52 21, 60 28, 74 22 C 88 16, 98 11, 112 16 C 122 20, 130 9, 138 12 L 138 34 L 2 34 Z"
                    fill="url(#sparkFill)"
                  />
                  <path
                    d="M2 26 C 18 26, 24 17, 38 19 C 52 21, 60 28, 74 22 C 88 16, 98 11, 112 16 C 122 20, 130 9, 138 12"
                    stroke="#10b981"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </aside>

          {/* Rounded Light Inner Workspace Sheet */}
          <div className="pz-main">
            {/* Contextual Breadcrumb & Page Hero Header (Matches Reference Pictures 1, 2 & 3) */}
            {sidebarNav === "document" && (
              <div className="page-hero-shell">
                <div className="page-breadcrumb-row">
                  <button
                    type="button"
                    className="back-breadcrumb-btn"
                    onClick={() => setSidebarNav("home")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                      <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Back to Documents</span>
                  </button>

                  <div className="page-top-actions">
                    <div className="doc-Select-pills">
                      {openPresetIds.map((docId) => {
                        const meta =
                          docId === "custom-doc" && customDocMeta
                            ? customDocMeta
                            : WORKSPACE_DOCS[docId];
                        if (!meta) return null;
                        const isAct = selectedDocId === docId;
                        return (
                          <button
                            key={docId}
                            type="button"
                            className={"mini-doc-switch " + (isAct ? "active" : "")}
                            onClick={() => {
                              if (docId === "custom-doc") {
                                setSelectedDocId("custom-doc");
                              } else {
                                handleSelectPresetDoc(docId);
                              }
                            }}
                          >
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
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="hero-action-btn"
                      onClick={handleExportRedacted}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Download</span>
                    </button>

                    <button
                      type="button"
                      className="hero-action-btn"
                      onClick={() => setUploadModalOpen(true)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                      </svg>
                      <span>Export</span>
                    </button>

                    <button
                      type="button"
                      className="hero-dots-btn"
                      aria-label="Hybrid routing inspector"
                      title="Inspect Firebase AI Logic Hybrid Routing"
                      onClick={() => setHybridInspectorOpen((v) => !v)}
                    >
                      •••
                    </button>
                  </div>
                </div>

                <div className="page-title-banner">
                  <div className="page-title-left">
                    <div className={`hero-doc-badge ${currentDocMeta.ext}`}>
                      <span className="hero-doc-fold" />
                      <span>{currentDocMeta.ext === "docx" ? "DOC" : "PDF"}</span>
                    </div>
                    <div>
                      <h1 className="hero-main-title">{currentDocMeta.fileName}</h1>
                      <div className="hero-subtitle">
                        {currentDocMeta.isLegal ? "Legal Privilege" : "Healthcare"} • 245 KB • Uploaded Apr 15, 2025
                      </div>
                    </div>
                  </div>

                  <div className="page-title-right">
                    <span className="processed-status-pill">
                      <span className="processed-check-dot" aria-hidden="true">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span>{isRunning ? "Processing Locally…" : "Processed Successfully"}</span>
                    </span>
                    <span className="processed-timestamp">Apr 15, 2025 • 2:34 PM</span>
                  </div>
                </div>

                {/* Horizontal Sub-Tab Bar: Overview | Redacted | Audit | Peek */}
                <div className="workspace-subtabs-bar" role="tablist" aria-label="Document view modes">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leftTab === "document"}
                    className={"ws-subtab " + (leftTab === "document" ? "active" : "")}
                    onClick={() => setLeftTab("document")}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6M8 13h8M8 17h5" />
                    </svg>
                    <span>Overview</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={leftTab === "redacted"}
                    className={"ws-subtab " + (leftTab === "redacted" ? "active" : "")}
                    onClick={() => setLeftTab("redacted")}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                    <span>Redacted</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={leftTab === "audit"}
                    className={"ws-subtab " + (leftTab === "audit" ? "active" : "")}
                    onClick={() => setLeftTab("audit")}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    <span>Audit</span>
                  </button>

                  <button
                    type="button"
                    className={"ws-subtab peek-tab " + (peekEnabled ? "peek-on" : "")}
                    onClick={() => setPeekEnabled((v) => !v)}
                    aria-pressed={peekEnabled}
                    title="Toggle inline vault token peek strip"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>Peek</span>
                  </button>
                </div>
              </div>
            )}

            {sidebarNav === "batch" && (
              <div className="page-hero-shell">
                <div className="page-breadcrumb-row">
                  <button
                    type="button"
                    className="back-breadcrumb-btn"
                    onClick={() => setSidebarNav("document")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                      <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Back to Documents</span>
                  </button>

                  <div className="page-top-actions">
                    <div className="doc-Select-pills">
                      {BATCH_PACKETS.map((pkt) => (
                        <button
                          key={pkt.id}
                          type="button"
                          className={"mini-doc-switch " + (selectedPacketId === pkt.id ? "active" : "")}
                          onClick={() => {
                            setSelectedPacketId(pkt.id);
                            setSelectedBatchFileId(pkt.files[0].id);
                            setBatchHighlightToken(null);
                          }}
                        >
                          <span>{pkt.name}</span>
                        </button>
                      ))}
                    </div>
                    <input
                      ref={batchFileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,.md,.csv,.json"
                      style={{ display: "none" }}
                      onChange={(e) => void handleAddFilesToBatch(e)}
                    />
                    <button
                      type="button"
                      className="hero-action-btn"
                      onClick={handleExportBatchPdf}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Export</span>
                    </button>
                    <button
                      type="button"
                      className="hero-dots-btn"
                      title="Add files to batch packet"
                      onClick={() => batchFileInputRef.current?.click()}
                    >
                      •••
                    </button>
                  </div>
                </div>

                <div className="page-title-banner">
                  <div className="page-title-left">
                    <div className="hero-doc-badge packet">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v1.8H8V13zm0 3.5h5v1.8H8v-1.8z" />
                      </svg>
                    </div>
                    <div>
                      <h1 className="hero-main-title">{activeBatchPacket.name}</h1>
                      <div className="hero-subtitle">
                        {batchCorpusResult.files.length} files • 245 KB • Uploaded Apr 15, 2025, 2:34 PM
                      </div>
                    </div>
                  </div>

                  <div className="page-title-right">
                    <span className="processed-status-pill">
                      <span className="processed-check-dot" aria-hidden="true">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span>Processed Successfully</span>
                    </span>
                    <span className="processed-timestamp">Apr 15, 2025 • 2:35 PM</span>
                  </div>
                </div>

                {/* Horizontal Sub-Tab Bar: Overview | Tokens | Synthetic | Blackout */}
                <div className="workspace-subtabs-bar" role="tablist" aria-label="Batch redaction mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={batchStrategy === "smart_tokens" && batchPreviewMode === "redacted"}
                    className={"ws-subtab " + (batchStrategy === "smart_tokens" ? "active" : "")}
                    onClick={() => setBatchStrategy("smart_tokens")}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M8 13h8M8 17h5" />
                    </svg>
                    <span>Overview</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={batchStrategy === "smart_tokens"}
                    className={"ws-subtab"}
                    onClick={() => {
                      setBatchStrategy("smart_tokens");
                      setBatchPreviewMode("redacted");
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                    <span>Tokens</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={batchStrategy === "synthetic_alias"}
                    className={"ws-subtab " + (batchStrategy === "synthetic_alias" ? "active" : "")}
                    onClick={() => setBatchStrategy("synthetic_alias")}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3l1.9 4.5L18.4 9l-4.5 1.9L12 15.4l-1.9-4.5L5.6 9l4.5-1.5L12 3z" />
                    </svg>
                    <span>Synthetic</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={batchStrategy === "legal_blackout"}
                    className={"ws-subtab " + (batchStrategy === "legal_blackout" ? "active" : "")}
                    onClick={() => setBatchStrategy("legal_blackout")}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M1 1l22 22" strokeLinecap="round" />
                    </svg>
                    <span>Blackout</span>
                  </button>
                </div>
              </div>
            )}

            {sidebarNav === "help" && (
              <div className="page-hero-shell">
                <div className="page-breadcrumb-row">
                  <button
                    type="button"
                    className="back-breadcrumb-btn"
                    onClick={() => setSidebarNav("document")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                      <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Back to Apps</span>
                  </button>
                </div>

                <div className="page-title-banner">
                  <div className="page-title-left">
                    <div className="hero-doc-badge apps">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <rect x="3" y="3" width="8" height="8" rx="2" />
                        <rect x="13" y="3" width="8" height="5" rx="1.5" />
                        <rect x="13" y="10" width="8" height="11" rx="2" />
                        <rect x="3" y="13" width="8" height="8" rx="2" />
                      </svg>
                    </div>
                    <div>
                      <h1 className="hero-main-title">Side Panel Integrations</h1>
                      <div className="hero-subtitle">
                        Browser and mobile app integrations for PII protection
                      </div>
                    </div>
                  </div>

                  <div className="page-title-right">
                    <span className="processed-status-pill">
                      <span className="processed-check-dot" aria-hidden="true">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span>All Systems Active</span>
                    </span>
                    <span className="processed-timestamp">Last updated: Apr 15, 2025 • 3:18 PM</span>
                  </div>
                </div>
              </div>
            )}

            {sidebarNav === "firewall" && (
              <div className="page-hero-shell">
                <div className="page-breadcrumb-row">
                  <button
                    type="button"
                    className="back-breadcrumb-btn"
                    onClick={() => setSidebarNav("document")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                      <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Back to Documents</span>
                  </button>
                  <div className="doc-Select-pills">
                    {FIREWALL_SCENARIOS.map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={"mini-doc-switch " + (selectedScenarioId === sc.id ? "active" : "")}
                        onClick={() => handleSelectFirewallScenario(sc.id)}
                      >
                        <span>{sc.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

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
              {/* LEFT PANEL: Document Source + Patient Info + Report Details */}
              <div className="left-column-stack">
                {/* Top Card: Document Source + VAULT Pill Strip */}
                <div className="source-vault-card">
                  <div className="source-vault-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6M8 13h8M8 17h5" />
                    </svg>
                    <span>Document Source</span>
                  </div>

                  {peekEnabled && activePeekEntry && (
                    <div className="vault-strip-pill" role="status">
                      <span className="vault-badge-dark mono">VAULT</span>
                      <span className="vault-strip-body">
                        <strong>{maskDisplayValue(activePeekEntry, !hiddenVaultTokens.has(activePeekEntry.token))}</strong>
                        <span className="vault-arrow-glyph" aria-hidden="true">→</span>
                        <span className="vault-token-blue mono">{activePeekEntry.token}</span>
                      </span>
                      <span className="vault-tap-tag mono">TAP TAG</span>
                    </div>
                  )}
                </div>

                {/* Main Left Card: Patient Info / Redacted / Audit */}
                <MagicCard className="glass-panel left-doc-card" aria-label="Document and local redaction proof">
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
                  <div className="footer-shield-meta">
                    <span className="footer-shield-badge" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L19 5.2v5.6c0 5-3.2 9.3-7 10.8-3.8-1.5-7-5.8-7-10.8V5.2L12 2zm-1.1 13.2l5-5-1.4-1.4-3.6 3.6-1.8-1.8-1.4 1.4 3.2 3.2z" />
                      </svg>
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                        <NumberTicker value={totalMasked} /> PII entities masked in RAM
                      </div>
                      <button
                        type="button"
                        className="footer-sublink"
                        onClick={() => setLeftTab(leftTab === "audit" ? "document" : "audit")}
                      >
                        View Details →
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inspect-payload-btn"
                    onClick={() =>
                      setLeftTab((prev) =>
                        prev === "document" ? "redacted" : prev === "redacted" ? "audit" : "document"
                      )
                    }
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                    </svg>
                    <span>
                      {leftTab === "document"
                        ? "Inspect Payload"
                        : leftTab === "redacted"
                        ? "Crypto Audit"
                        : "Source Doc"}
                    </span>
                  </button>
                </div>
              </MagicCard>
              </div>

              {/* RIGHT PANEL: Dark Navy Executive Synthesis Card + Bottom Light Ask Dock */}
              <div className="right-column-stack">
                <div className="navy-synthesis-card" aria-label="AI Executive Synthesis">
                  <div className="navy-synthesis-top">
                    <div>
                      <div className="navy-title-row">
                        <span className="navy-sparkle" aria-hidden="true">✦</span>
                        <h2 className="navy-h2">
                          {routingPolicy === "airgapped_local_only"
                            ? "On-Device Local Summary"
                            : "Executive Synthesis"}
                        </h2>
                      </div>
                      <div className="navy-badge-row">
                        <span className="navy-model-pill mono">GEMINI 2.5 FLASH</span>
                        <button
                          type="button"
                          className="navy-toggle-mode mono"
                          onClick={() => setRehydrateRight((v) => !v)}
                        >
                          {rehydrateRight ? "RESTORED" : "TOKENS"}
                        </button>
                        <button
                          type="button"
                          className="navy-toggle-mode mono"
                          onClick={() => setRightTab((t) => (t === "insights" ? "qa" : "insights"))}
                        >
                          {rightTab === "insights" ? "Q&A THREAD" : "SYNTHESIS"}
                        </button>
                      </div>
                    </div>

                    <div className="navy-ring-wrap">
                      <AnimatedCircularProgressBar
                        value={100}
                        size={54}
                        strokeWidth={9}
                        gaugePrimaryColor="#10b981"
                        gaugeSecondaryColor="rgba(255, 255, 255, 0.14)"
                        className="navy-100-gauge"
                      />
                    </div>
                  </div>

                  {rightTab === "insights" ? (
                    <>
                      <div className="navy-prose">
                        {renderRestoredProse(analysis?.executiveSummary ?? "")}
                      </div>

                      <div className="navy-kicker mono">KEY INFORMATION</div>

                      <div className="navy-kpi-grid">
                        <div className="navy-kpi-card">
                          <div className="navy-kpi-head">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2.2c-3.8 0-7.5 1.9-7.5 4.6V21h15v-2.2c0-2.7-3.7-4.6-7.5-4.6z" />
                            </svg>
                            <span>{currentDocMeta.kpi1Label}</span>
                          </div>
                          <div className="navy-kpi-val">{currentDocMeta.kpi1Main}</div>
                          <div className="navy-kpi-sub">{primarySubjectName}</div>
                        </div>

                        <div className="navy-kpi-card">
                          <div className="navy-kpi-head">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                              <rect x="3" y="4" width="18" height="17" rx="2.5" />
                              <path d="M8 2v4M16 2v4M3 9h18" strokeLinecap="round" />
                            </svg>
                            <span>{currentDocMeta.kpi2Label}</span>
                          </div>
                          <div className="navy-kpi-val">{currentDocMeta.kpi2Main}</div>
                          <div className="navy-kpi-sub">{currentDocMeta.kpi2Sub}</div>
                        </div>

                        <div className="navy-kpi-card">
                          <div className="navy-kpi-head">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v4h4v2h-4v4h-2v-4H7v-2h4V7h2z" />
                            </svg>
                            <span>{currentDocMeta.kpi3Label}</span>
                          </div>
                          <div className="navy-kpi-val">{currentDocMeta.kpi3Main}</div>
                          <div className="navy-kpi-sub">{currentDocMeta.kpi3Sub}</div>
                        </div>
                      </div>

                      <div className="mint-rehydration-banner">
                        <span className="mint-check-circle" aria-hidden="true">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <div>
                          <div className="mint-banner-title">RAM Rehydration</div>
                          <div className="mint-banner-copy">
                            {rehydrateRight
                              ? "Identifiers restored locally in browser memory; Cloud AI processed tokens only."
                              : "Viewing exact zero-PII token output returned by Cloud AI prior to rehydration."}
                          </div>
                        </div>
                      </div>

                      <div className="navy-actions-head">
                        <span className="navy-bolt" aria-hidden="true">⚡</span>
                        <span>Recommended Actions</span>
                      </div>

                      <div className="navy-steps-list">
                        {analysis?.pharmacovigilanceOrClauseAlerts.map((alert, idx) => (
                          <div key={idx} className="navy-step-row">
                            <span className="navy-step-num mono" aria-hidden="true">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="navy-step-text">
                              {alert.title === alert.recommendation ? (
                                renderRestoredProse(alert.recommendation)
                              ) : (
                                <>
                                  <strong>{alert.title}: </strong>
                                  {renderRestoredProse(alert.recommendation)}
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="navy-qa-thread" aria-live="polite">
                      {qaThread.map((turn) => (
                        <div key={turn.id} className="navy-qa-card">
                          <div className="navy-qa-q">Q: {turn.question}</div>
                          <div className="navy-qa-proof mono">
                            Sent to Cloud as: {turn.sanitizedQuestion}
                          </div>
                          <div className="navy-qa-a">{turn.intro}</div>
                          {turn.sections.map((sec, sIdx) => (
                            <div key={sIdx} className="navy-qa-sec">
                              <strong>{sec.heading}: </strong>
                              {renderRestoredProse(sec.cloudBody)}
                            </div>
                          ))}
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                            <button
                              type="button"
                              className="navy-toggle-mode mono"
                              onClick={() => handleCopySummary(turn)}
                            >
                              {copiedId === turn.id ? "✓ COPIED" : "COPY SUMMARY"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Light Query Dock + Prompt Suggestion Chips */}
                <div className="light-ask-dock">
                  <form
                    className={"ask-input-shell" + (askFocused || isAskingQa ? " focused" : "")}
                    onSubmit={(e) => {
                      e.preventDefault();
                      setRightTab("qa");
                      void handleAskQuestion(questionDraft);
                    }}
                  >
                    <span className="ask-sparkle-icon" aria-hidden="true">✦</span>
                    <input
                      type="text"
                      className="ask-input"
                      placeholder="Query anonymized document..."
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
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </form>

                  <div className="prompt-chips-row">
                    {currentDocMeta.quickChips.slice(0, 2).map((chip, cIdx) => (
                      <RippleButton
                        key={chip}
                        type="button"
                        className="prompt-chip"
                        onClick={() => {
                          setRightTab("qa");
                          void handleAskQuestion(chip);
                        }}
                      >
                        <span className="chip-lead-icon" aria-hidden="true">
                          {cIdx === 0 ? "☰" : "?"}
                        </span>
                        <span>{chip}</span>
                      </RippleButton>
                    ))}
                  </div>
                </div>
              </div>
            </main>
          )}

          {/* ==================== VIEW 1B: BATCH STUDIO (MATCHES PICTURE 3 EXACTLY) ==================== */}
          {sidebarNav === "batch" && (
            <main className="workspace-split" aria-label="Multi-Document Batch De-Identification Studio">
              {/* LEFT COLUMN: Packet Queue + Selected File Preview + Cross-Document Vault Summary + Footer */}
              <div className="left-column-stack">
                {/* 1. Packet Queue Card */}
                <div className="white-card-box">
                  <div className="card-header-flex">
                    <div className="card-header-title">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2.1" aria-hidden="true">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Packet Queue ({batchCorpusResult.files.length} Files)</span>
                    </div>
                    <span className="processed-status-pill compact">
                      <span className="processed-check-dot" aria-hidden="true">✓</span>
                      <span>{batchCorpusResult.files.length} Processed</span>
                    </span>
                  </div>

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
                          </div>
                          <div className="batch-file-name-row">
                            <span className="batch-file-name">{bf.fileName}</span>
                            <span className="batch-chevron" aria-hidden="true">›</span>
                          </div>
                          <div className="batch-masked-line">
                            <span className="processed-check-dot mini" aria-hidden="true">✓</span>
                            <span>Masked • 0 Issues</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Selected File Preview Card */}
                {activeBatchFile && (
                  <div className="white-card-box">
                    <div className="card-header-flex" style={{ marginBottom: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <span className="batch-doc-blue-icon" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
                          </svg>
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--ink-900)" }}>
                            {activeBatchFile.fileName}
                          </div>
                          <div className="mono" style={{ fontSize: "11px", color: "var(--ink-500)" }}>
                            SHA-256 • #{activeBatchFile.sha256.slice(0, 12).toUpperCase()}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="batch-ext-icon-btn"
                        title="Open in Document Workspace"
                        onClick={() => handleOpenBatchFileInWorkspace(activeBatchFile)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>

                    <div className="batch-preview-toolbar">
                      <div className="batch-mode-pills">
                        <button
                          type="button"
                          className={"batch-pill-toggle " + (batchPreviewMode === "redacted" ? "active" : "")}
                          onClick={() => setBatchPreviewMode("redacted")}
                        >
                          Redacted
                        </button>
                        <button
                          type="button"
                          className={"batch-pill-toggle " + (batchPreviewMode === "raw" ? "active" : "")}
                          onClick={() => setBatchPreviewMode("raw")}
                        >
                          Original
                        </button>
                      </div>

                      <button
                        type="button"
                        className="batch-open-doc-btn"
                        onClick={() => handleOpenBatchFileInWorkspace(activeBatchFile)}
                      >
                        <span>Open in Doc</span>
                        <span aria-hidden="true">⌄</span>
                      </button>
                    </div>

                    <div className="batch-kv-preview-sheet">
                      {batchPreviewMode === "raw" ? (
                        <div style={{ fontSize: "12.5px", lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--ink-700)" }}>
                          {activeBatchFile.rawText}
                        </div>
                      ) : (
                        <div className="batch-kv-table">
                          <div className="batch-kv-row">
                            <span className="batch-kv-k">Patient Name:</span>
                            <span className="batch-kv-v mono">[PATIENT_1]</span>
                          </div>
                          <div className="batch-kv-row">
                            <span className="batch-kv-k">Date of Birth:</span>
                            <span className="batch-kv-v mono">[PII_DOB_01]</span>
                          </div>
                          <div className="batch-kv-row">
                            <span className="batch-kv-k">SSN:</span>
                            <span className="batch-kv-v mono">[PII_SSN_01]</span>
                          </div>
                          <div className="batch-kv-row">
                            <span className="batch-kv-k">MRN:</span>
                            <span className="batch-kv-v mono">[PII_MRN_01]</span>
                          </div>
                          <div className="batch-kv-row">
                            <span className="batch-kv-k">Provider:</span>
                            <span className="batch-kv-v mono">[PROVIDER_1]</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Cross-Document Vault Summary Card */}
                <div className="white-card-box">
                  <div className="card-header-flex">
                    <div className="card-header-title">
                      <span className="vault-shield-blue" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L19 5.5v5.5c0 5-3.2 9.2-7 10.8-3.8-1.6-7-5.8-7-10.8V5.5L12 2zm0 3.2v12.8c2.6-1.3 4.8-4.5 4.8-8.1V6.8L12 5.2z" />
                        </svg>
                      </span>
                      <span>Cross-Document Vault ({batchCorpusResult.sharedVault.length} Unique Files)</span>
                    </div>
                    <button
                      type="button"
                      className="footer-link-btn"
                      onClick={() => setBatchVaultExpanded((v) => !v)}
                    >
                      {batchVaultExpanded ? "Hide ↑" : "View All →"}
                    </button>
                  </div>

                  <div className="vault-filetype-counts-row">
                    <span className="vault-ft-chip pdf">
                      <span className="ft-tag">PDF</span>
                      <strong>5</strong>
                    </span>
                    <span className="vault-ft-chip docx">
                      <span className="ft-tag">W</span>
                      <strong>4</strong>
                    </span>
                    <span className="vault-ft-chip xlsx">
                      <span className="ft-tag">X</span>
                      <strong>3</strong>
                    </span>
                    <span className="vault-ft-chip more">+1</span>
                  </div>

                  {batchVaultExpanded && (
                    <div style={{ maxHeight: "185px", overflowY: "auto", marginTop: "10px" }}>
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
                  )}
                </div>

                {/* 4. Bottom Export Packet Footer Strip */}
                <div className="batch-bottom-strip">
                  <div className="batch-bottom-info">
                    <span className="batch-info-circle" aria-hidden="true">i</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--ink-900)" }}>
                        {batchCorpusResult.totalMaskedInstances} PII spans linked across {batchCorpusResult.files.length} files
                      </div>
                      <div style={{ fontSize: "11.5px", color: "#2563eb", fontWeight: 500 }}>
                        View raw PII bytes sent
                      </div>
                    </div>
                  </div>
                  <button type="button" className="dark-navy-cta-btn" onClick={handleExportBatchPdf}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Export Packet PDF</span>
                  </button>
                </div>
              </div>

              {/* RIGHT PANEL: Cross-Packet Reconciliation Card */}
              <div className="white-card-box">
                <div className="card-header-flex" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--line-soft)" }}>
                  <div className="card-header-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2" aria-hidden="true">
                      <circle cx="18" cy="18" r="3" />
                      <circle cx="6" cy="6" r="3" />
                      <path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12" />
                    </svg>
                    <span>Cross-Packet Reconciliation</span>
                  </div>
                  <button
                    type="button"
                    className="batch-open-doc-btn"
                    onClick={() => setRehydrateRight((v) => !v)}
                  >
                    <span>{rehydrateRight ? "View Details" : "Cloud Tokens"}</span>
                    <span aria-hidden="true">⌄</span>
                  </button>
                </div>

                <div className="insights-stack" style={{ marginTop: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                    <span className="big-emerald-check" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <h2 className="section-h3" style={{ fontSize: "16px" }}>
                      {activeBatchPacket.crossDocSynthesisTitle}
                    </h2>
                  </div>

                  <div className="summary-prose">
                    {rehydrateRight
                      ? replaceTokensWithValues(
                          activeBatchPacket.crossDocSynthesisSummary,
                          batchSharedVaultEntries,
                          new Set()
                        )
                      : activeBatchPacket.crossDocSynthesisSummary}
                  </div>

                  <div className="batch-kpi-row">
                    <div className="batch-kpi-box">
                      <span className="batch-kpi-icon" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6M8 13h8" />
                        </svg>
                      </span>
                      <span className="batch-kpi-lbl">Packet Scope</span>
                      <span className="batch-kpi-val">{batchCorpusResult.files.length} Records</span>
                      <span className="batch-kpi-sub">{batchCorpusResult.totalMaskedInstances} Spans Masked</span>
                    </div>

                    <div className="batch-kpi-box">
                      <span className="batch-kpi-icon" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </span>
                      <span className="batch-kpi-lbl">Shared Entities</span>
                      <span className="batch-kpi-val">{batchCorpusResult.crossFileEntityCount} Linked</span>
                      <span className="batch-kpi-sub">Cross-Patient Co-reference</span>
                    </div>

                    <div className="batch-kpi-box">
                      <span className="batch-kpi-icon" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                          <path d="M17.5 19H7a4.5 4.5 0 0 1-.9-8.9A6 6 0 0 1 17.8 9a4 4 0 0 1-.3 10Z" />
                        </svg>
                      </span>
                      <span className="batch-kpi-lbl">Cloud Exposure</span>
                      <span className="batch-kpi-val">0 Bytes</span>
                      <span className="batch-kpi-sub mono">#{batchCorpusResult.batchManifestSha256.slice(0, 8).toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="mint-rehydration-banner light">
                    <span className="mint-check-circle" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <div className="mint-banner-copy" style={{ color: "#064e3b", fontWeight: 500 }}>
                      Cross-file risks detected because shared tokens preserved identity across all {batchCorpusResult.files.length} documents.
                    </div>
                  </div>

                  <h3 className="section-h3" style={{ marginTop: "2px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2" aria-hidden="true">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                    </svg>
                    <span>Cross-Document Findings &amp; Mismatches</span>
                  </h3>

                  <div className="next-steps-list">
                    {activeBatchPacket.crossDocAlerts.map((al, i) => {
                      const titleTxt = rehydrateRight
                        ? replaceTokensWithValues(al.title, batchSharedVaultEntries, new Set())
                        : al.title;
                      const detailTxt = rehydrateRight
                        ? replaceTokensWithValues(al.detail, batchSharedVaultEntries, new Set())
                        : al.detail;
                      const isInfo = al.severity.toLowerCase() === "info";
                      return (
                        <div key={i} className={`batch-finding-card ${al.severity.toLowerCase()}`}>
                          <div className="batch-finding-left">
                            {isInfo ? (
                              <span className="finding-info-circle" aria-hidden="true">i</span>
                            ) : (
                              <span className={`severity-tag ${al.severity.toLowerCase()}`}>
                                {al.severity}
                              </span>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="batch-finding-title">{titleTxt}</div>
                              <div className="batch-finding-desc">{detailTxt}</div>
                            </div>
                          </div>
                          <span className="batch-chevron" aria-hidden="true">›</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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

          {/* ==================== VIEW 5: APPS & SIDE PANEL INTEGRATIONS (MATCHES PICTURE 1 EXACTLY) ==================== */}
          {sidebarNav === "help" && (
            <div className="apps-showcase-stack">
              {/* Top Card: Chrome Side Panel Extension (MV3) */}
              <section className="white-card-box apps-card">
                <div className="apps-card-header">
                  <div className="apps-card-title-group">
                    <svg className="chrome-logo-svg" viewBox="0 0 48 48" aria-hidden="true">
                      <circle cx="24" cy="24" r="21" fill="#f1f5f9" />
                      <path d="M24 3A21 21 0 0 1 42.2 13.5H24V24l-9.1-5.2L6.8 9.9A20.9 20.9 0 0 1 24 3z" fill="#ea4335" />
                      <path d="M6.8 9.9L15.9 25.7 24 34.5 14.9 42.9A21 21 0 0 1 6.8 9.9z" fill="#34a853" />
                      <path d="M24 13.5h18.2A21 21 0 0 1 24 45l-9.1-2.1L24 27v-13.5z" fill="#fbbc05" />
                      <circle cx="24" cy="24" r="9.5" fill="#ffffff" />
                      <circle cx="24" cy="24" r="7.5" fill="#1a73e8" />
                    </svg>
                    <div>
                      <h2 className="apps-h2">Chrome Side Panel Extension (MV3)</h2>
                      <p className="apps-desc">
                        Scrub sensitive text directly inside any hospital EHR or legal web portal before pasting into AI tools.
                      </p>
                    </div>
                  </div>

                  <div className="apps-header-actions">
                    <a className="dark-navy-cta-btn" href="/downloads/piizero-chrome-extension.zip" download>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Download .zip</span>
                    </a>
                    <button
                      type="button"
                      className="hero-action-btn"
                      onClick={() => setSidebarNav("document")}
                    >
                      <span>View Details</span>
                      <span aria-hidden="true">⌄</span>
                    </button>
                  </div>
                </div>

                {/* Browser Window Mockup matching Picture 1 */}
                <div className="chrome-browser-mock">
                  <div className="chrome-toolbar-row">
                    <div className="pz-terminal-dots" aria-hidden="true">
                      <span className="dot red" />
                      <span className="dot amber" />
                      <span className="dot green" />
                    </div>
                    <div className="chrome-url-pill">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <rect x="4" y="11" width="16" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                      <span>ehr.riverside-medical.org</span>
                    </div>
                    <div className="chrome-ext-icons" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#64748b">
                        <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-2 .9-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20c0 1.1.9 2 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" />
                      </svg>
                      <span className="chrome-mini-shield">
                        <ShieldSparkleLogo />
                      </span>
                    </div>
                  </div>

                  <div className="chrome-sidepanel-split">
                    <div className="chrome-sp-left">
                      <div className="chrome-sp-header">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="chrome-mini-shield">
                            <ShieldSparkleLogo />
                          </span>
                          <strong style={{ fontSize: "14.5px", color: "var(--ink-900)" }}>
                            PII-Zero Side Panel
                          </strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="processed-status-pill compact">
                            <span className="live-emerald-dot" />
                            <span>Active ›</span>
                          </span>
                          <span style={{ color: "#64748b" }} aria-hidden="true">⚙</span>
                        </div>
                      </div>

                      <div className="chrome-sp-body">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "14px", color: "var(--ink-900)", marginBottom: "4px" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.1" aria-hidden="true">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6M8 13h8M8 17h5" />
                          </svg>
                          <span>Detected Sensitive Information</span>
                        </div>
                        <p style={{ fontSize: "12.5px", color: "var(--ink-500)", marginBottom: "12px" }}>
                          Patient information has been detected and will be masked:
                        </p>

                        <div className="chrome-detected-grid">
                          <div className="chrome-det-col">
                            <span className="chrome-det-label">Patient Name</span>
                            <span className="entity-pill token-mono blue">[PATIENT_1]</span>
                          </div>
                          <div className="chrome-det-col">
                            <span className="chrome-det-label">Date of Birth</span>
                            <span className="entity-pill token-mono green">[DOB_1]</span>
                          </div>
                          <div className="chrome-det-col">
                            <span className="chrome-det-label">SSN</span>
                            <span className="entity-pill token-mono purple">[SSN_1]</span>
                          </div>
                          <div className="chrome-det-col">
                            <span className="chrome-det-label">Provider</span>
                            <span className="entity-pill token-mono blue">[PROVIDER_1]</span>
                          </div>
                          <div className="chrome-det-col">
                            <span className="chrome-det-label">Visit Date</span>
                            <span className="entity-pill token-mono green">[VISIT_DATE_1]</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="chrome-sp-right">
                      <span className="safe-copy-circle" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.6">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <div className="safe-copy-label">
                        Text is safe
                        <br />
                        to copy and paste
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Bottom Card: Android & Galaxy Z Fold7 Dual-Screen App */}
              <section className="white-card-box apps-card">
                <div className="apps-card-header">
                  <div className="apps-card-title-group">
                    <svg className="android-logo-svg" viewBox="0 0 48 48" aria-hidden="true">
                      <path d="M15 11l-2.6-4.5a1 1 0 0 1 1.7-1l2.8 4.8A13.8 13.8 0 0 1 24 8.5c2.6 0 5 .6 7.1 1.8l2.8-4.8a1 1 0 1 1 1.7 1L33 11a13.4 13.4 0 0 1 6.5 11H8.5A13.4 13.4 0 0 1 15 11zm4 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 24h30v12a4 4 0 0 1-4 4h-2v6a2.5 2.5 0 0 1-5 0v-6h-8v6a2.5 2.5 0 0 1-5 0v-6h-2a4 4 0 0 1-4-4V24zm-5.5 0A2.5 2.5 0 0 1 6 26.5v9a2.5 2.5 0 0 1-5 0v-9A2.5 2.5 0 0 1 3.5 24zm41 0a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-5 0v-9a2.5 2.5 0 0 1 2.5-2.5z" fill="#7cb342" />
                    </svg>
                    <div>
                      <h2 className="apps-h2">Android &amp; Galaxy Z Fold7 Dual-Screen App</h2>
                      <p className="apps-desc">
                        Enjoy a seamless experience across devices with powerful dual-screen support.
                      </p>
                    </div>
                  </div>

                  <div className="apps-header-actions">
                    <button
                      type="button"
                      className="hero-action-btn"
                      onClick={() => setFoldPosture((p) => (p === "unfolded" ? "cover" : "unfolded"))}
                    >
                      {foldPosture === "unfolded" ? "Switch to Cover" : "Switch to Unfolded"}
                    </button>
                    <a className="dark-navy-cta-btn" href="/downloads/piizero-android-debug.apk" download>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Download</span>
                    </a>
                  </div>
                </div>

                <AndroidMockup unfolded={foldPosture === "unfolded"}>
                  {foldPosture === "unfolded" ? (
                    <div className="fold-dual">
                      <div className="fold-pane-left">
                        <div className="fold-pane-kicker blue">
                          LEFT SCREEN • LOCAL RAM VAULT
                        </div>
                        <div className="fold-pane-text">
                          <strong>Patient Name:</strong> John Doe <strong>Date of Birth:</strong> 04/15/1978 <strong>SSN:</strong> 123-45-6789 <strong>Visit Summary:</strong> Patient presented with ongoing back pain and was evaluated for possible disc herniation. Recommended follow-up in 3 months.
                        </div>
                      </div>
                      <div className="fold-hinge" title="Galaxy Z Fold7 Hinge" />
                      <div className="fold-pane-right">
                        <div className="fold-pane-kicker green">
                          RIGHT SCREEN • RESTORED REVIEW
                        </div>
                        <div className="fold-pane-text">
                          {renderRestoredProse(analysis?.executiveSummary ?? "")}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="fold-pane-right">
                      <div className="fold-pane-kicker green">
                        COVER SCREEN • 0 B PII EGRESS
                      </div>
                      <div className="fold-pane-text">
                        {renderRestoredProse(analysis?.executiveSummary ?? "")}
                      </div>
                    </div>
                  )}
                </AndroidMockup>
              </section>
            </div>
          )}
        </div>
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

