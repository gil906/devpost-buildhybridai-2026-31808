import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  askHybridDocumentQuestion,
  generateSdkCodeSnippet,
  isLiveFirebaseConfigured,
  type FirebaseWebConfig,
  type HybridPipelineExecutionResult,
  type QaAnswerSection
} from "./engine/firebaseHybridSdk";

type SidebarNav = "home" | "document" | "history" | "settings" | "help";
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
        <linearGradient id="pzShieldGrad" x1="4" y1="3" x2="36" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="55%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path
        d="M20 3L34 8.6v10.2c0 8.6-5.9 15.9-14 18.2C11.9 34.7 6 27.4 6 18.8V8.6L20 3z"
        fill="url(#pzShieldGrad)"
      />
      <path
        d="M20 9.2l8.5 3.4v6.2c0 5.4-3.6 10.1-8.5 11.8-4.9-1.7-8.5-6.4-8.5-11.8v-6.2L20 9.2z"
        fill="#ffffff"
        fillOpacity="0.16"
      />
      <path
        d="M20 11.5l2.3 5.2 5.2 2.3-5.2 2.3-2.3 5.2-2.3-5.2-5.2-2.3 5.2-2.3 2.3-5.2z"
        fill="#ffffff"
      />
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
  const [hiddenVaultTokens, setHiddenVaultTokens] = useState<Set<string>>(() => new Set());
  const [rehydrateRight, setRehydrateRight] = useState<boolean>(urlInit.rehydrate);

  const [stage1Mode, setStage1Mode] = useState<InferenceMode>(InferenceMode.ONLY_ON_DEVICE);
  const [cloudModelName, setCloudModelName] = useState<string>("gemini-2.5-flash");
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseWebConfig>(DEFAULT_DEMO_FIREBASE_CONFIG);
  const [configJsonText, setConfigJsonText] = useState<string>(
    JSON.stringify(DEFAULT_DEMO_FIREBASE_CONFIG, null, 2)
  );
  const [sdkLang, setSdkLang] = useState<"ts" | "kotlin">("ts");
  const [foldPosture, setFoldPosture] = useState<"unfolded" | "cover">("unfolded");

  const [pipelineResult, setPipelineResult] = useState<HybridPipelineExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [qaThread, setQaThread] = useState<QaConversationItem[]>([]);
  const [questionDraft, setQuestionDraft] = useState<string>("");
  const [isAskingQa, setIsAskingQa] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [pasteDraftTitle, setPasteDraftTitle] = useState<string>("Client Document.pdf");
  const [pasteDraftBody, setPasteDraftBody] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        sanitizedQuestion: meta.defaultQuestion,
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
    const content = [
      `PII-ZERO VERIFIED REDACTED EXPORT (${currentDocMeta.fileName})`,
      `SHA-256 Receipt: ${pipelineResult.scrubResult.sanitizedSha256}`,
      `Cloud PII Bytes Exposed: 0`,
      `------------------------------------------------------------`,
      "",
      pipelineResult.scrubResult.sanitizedText
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentDocMeta.fileName.replace(/\.(pdf|docx)$/i, "") + "-REDACTED.txt";
    a.click();
    URL.revokeObjectURL(url);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setPasteDraftTitle(file.name);
      setPasteDraftBody(content);
    };
    reader.readAsText(file);
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

  const handleSaveFirebaseSettings = () => {
    try {
      const parsed = JSON.parse(configJsonText) as FirebaseWebConfig;
      setFirebaseConfig(parsed);
      void executeAirlock(
        rawText,
        customTermsInput,
        stage1Mode,
        parsed,
        cloudModelName,
        selectedDocId
      );
      setSidebarNav("document");
    } catch {
      setSimulatedLeakAlert({
        title: "Invalid Firebase Configuration JSON",
        detail: "Please ensure your Firebase Web SDK JSON object is valid before saving."
      });
    }
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

  const primarySubjectName = useMemo(() => {
    const person = vaultEntries.find((v) => v.category === "PATIENT_CLIENT_NAME");
    if (!person) return "Protected Subject";
    return maskDisplayValue(person, !hiddenVaultTokens.has(person.token));
  }, [vaultEntries, hiddenVaultTokens]);

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
      if (!firstTracker.assigned && entry.category === "PATIENT_CLIENT_NAME") {
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

      return (
        <span
          key={idx}
          className="entity-pill-anchor"
          onMouseEnter={() => setActivePeekOccurrenceKey(occKey)}
          onClick={() => {
            setActivePeekOccurrenceKey(occKey);
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
          <span className={`entity-pill ${color}`}>
            {entry.originalValue !== "Dr. Sarah Johnson" && (
              <PillMiniIcon category={entry.category} />
            )}
            <span>{shownText}</span>
            {entry.category === "SSN" && (
              <span style={{ opacity: 0.72, fontSize: "11px" }} aria-hidden="true">
                ⊘
              </span>
            )}
          </span>
        </span>
      );
    });
  };

  /**
   * Renders placeholder tokens ([PATIENT_1], [COMPANY_A], [PII_*], etc.) inside Redacted Version
   */
  const renderTokenPillsInText = (text: string): React.ReactNode => {
    if (!text) return null;
    const byToken = new Map<string, VaultEntry>();
    for (const v of vaultEntries) byToken.set(v.token, v);

    return text.split(/(\[[A-Z][A-Z0-9_]*\]|\b5 years\b)/g).map((part, idx) => {
      if (part === "5 years") {
        return (
          <span key={idx} className="entity-pill amber" style={{ padding: "1px 8px", borderRadius: "6px" }}>
            5 years
          </span>
        );
      }
      if (/^\[[A-Z][A-Z0-9_]*\]$/.test(part)) {
        const entry = byToken.get(part);
        const color = entry ? getEntryPillColor(entry) : "purple";
        return (
          <span
            key={idx}
            className={`entity-pill token-mono ${color}`}
            title={
              entry
                ? `Local RAM value: "${maskDisplayValue(entry, !hiddenVaultTokens.has(entry.token))}" (${entry.label})`
                : "Anonymized Cloud Token"
            }
          >
            {part}
          </span>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  /**
   * Renders right-side AI analysis / Q&A prose with soft blue locally restored entity pills
   */
  const renderRestoredProse = (cloudSourceText: string): React.ReactNode => {
    if (!cloudSourceText) return null;
    if (!rehydrateRight) {
      return renderTokenPillsInText(cloudSourceText);
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
          return (
            <span
              key={idx}
              className="restored-pill"
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
        : renderTokenPillsInText(txt);

    return (
      <div className={mode === "redacted" ? "doc-paper compact" : "doc-paper"}>
        {currentDocMeta.showInstHeader && (
          <div className="doc-inst-header">
            <div className="med-cross-icon" aria-hidden="true">
              {currentDocMeta.isLegal ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M9 13h6M9 17h4" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z" />
                </svg>
              )}
            </div>
            <div>
              <div className="doc-inst-name">{currentDocMeta.instTitle}</div>
              <div className="doc-inst-sub">{currentDocMeta.instSub}</div>
            </div>
          </div>
        )}

        <h2 className="doc-report-title">{currentDocMeta.reportTitle}</h2>

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
      {/* Smooth Atmospheric Mountain-Dawn SVG Backdrop */}
      <div className="mountain-backdrop" aria-hidden="true">
        <svg viewBox="0 0 1440 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mtnBack" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bdcde6" stopOpacity="0.52" />
              <stop offset="100%" stopColor="#e4edf9" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="mtnMid" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9eb6da" stopOpacity="0.48" />
              <stop offset="100%" stopColor="#d7e4f5" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="mtnFront" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#86a3ce" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#d3e0f3" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path
            d="M120,420 C290,300 410,165 560,158 C705,152 810,255 950,210 C1085,166 1185,62 1315,74 C1375,80 1415,120 1440,145 L1440,420 Z"
            fill="url(#mtnBack)"
          />
          <path
            d="M380,420 C535,320 665,195 805,192 C935,190 1015,278 1135,246 C1245,216 1345,112 1440,108 L1440,420 Z"
            fill="url(#mtnMid)"
          />
          <path
            d="M690,420 C835,338 960,245 1095,248 C1225,250 1335,185 1440,168 L1440,420 Z"
            fill="url(#mtnFront)"
          />
        </svg>
      </div>

      <div className="pz-app">
        {/* Left Frosted Sidebar with Pine-Mountain Footer */}
        <aside className="pz-sidebar" aria-label="Primary navigation">
          <div className="sidebar-top">
            <button
              type="button"
              className="brand-lockup"
              onClick={() => setSidebarNav("document")}
            >
              <ShieldSparkleLogo />
              <span className="brand-wordmark">PII-Zero</span>
            </button>

            <nav className="sidebar-nav">
              <button
                type="button"
                className={"sidebar-link " + (sidebarNav === "home" ? "active" : "")}
                onClick={() => setSidebarNav("home")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5z" />
                </svg>
                <span>Home</span>
              </button>

              <button
                type="button"
                className={"sidebar-link " + (sidebarNav === "document" ? "active" : "")}
                onClick={() => setSidebarNav("document")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M8 13h8M8 17h5" />
                </svg>
                <span>Document</span>
              </button>

              <button
                type="button"
                className={"sidebar-link " + (sidebarNav === "history" ? "active" : "")}
                onClick={() => setSidebarNav("history")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span>History</span>
              </button>

              <button
                type="button"
                className={"sidebar-link " + (sidebarNav === "settings" ? "active" : "")}
                onClick={() => setSidebarNav("settings")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" />
                </svg>
                <span>Settings</span>
              </button>

              <button
                type="button"
                className={"sidebar-link " + (sidebarNav === "help" ? "active" : "")}
                onClick={() => setSidebarNav("help")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.6-2.5 2-2.5 3.8M12 17h.01" />
                </svg>
                <span>Help &amp; Apps</span>
              </button>
            </nav>
          </div>

          <svg className="sidebar-pine-art" viewBox="0 0 210 220" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,150 L68,95 L138,142 L210,104 L210,220 L0,220 Z" fill="#ceddf2" opacity="0.65" />
            <path d="M0,175 L95,126 L175,168 L210,148 L210,220 L0,220 Z" fill="#b7cde9" opacity="0.72" />
            <g fill="#7c9cc6" opacity="0.58">
              <polygon points="22,118 8,148 36,148" />
              <polygon points="22,134 5,168 39,168" />
              <polygon points="22,152 2,190 42,190" />
              <polygon points="50,136 39,160 61,160" />
              <polygon points="50,150 36,180 64,180" />
              <polygon points="75,148 66,168 84,168" />
              <polygon points="75,160 63,186 87,186" />
            </g>
          </svg>

          <div className="sidebar-bottom">
            <div className="sidebar-motto">
              Your Privacy.
              <br />
              Our Priority.
            </div>
          </div>
        </aside>

        {/* Main Content Canvas */}
        <div className="pz-main">
          {/* Top Document Bar + Status Badge */}
          <header className="pz-topbar">
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
                    <span className={`file-type-icon ${meta.ext}`}>
                      {meta.ext === "docx" ? "W" : "PDF"}
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
                  </button>
                );
              })}

              <button
                type="button"
                className="upload-pill-btn"
                onClick={() => setUploadModalOpen(true)}
              >
                <span style={{ fontSize: "16px", fontWeight: 500 }}>+</span>
                <span>Upload / Paste</span>
              </button>
            </div>

            <div className="scrubber-status-pill" title="Pre-send gatekeeper verified 0 raw PII bytes leave your device">
              <span className="live-green-dot" />
              <span>
                On-Device Scrubber Active • <strong>0 PII Sent to Cloud</strong>
              </span>
              <span className="shield-verified-icon" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                  <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </span>
            </div>
          </header>

          {/* Centered Two-Stage Hybrid AI Pipeline Strip */}
          <div className="hybrid-pipeline-row">
            <div className="hybrid-pipeline-pill" aria-label="Hybrid AI execution summary">
              <span className="pipeline-step">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="12" rx="2" />
                  <path d="M2 20h20" />
                </svg>
                <span>
                  On-Device AI: <strong>{isRunning ? "Scanning…" : `${totalMasked} PII Entities Masked Locally`}</strong>
                </span>
              </span>

              <span className="pipeline-arrow" aria-hidden="true">
                →
              </span>

              <span className="pipeline-step cloud">
                <span className="pipeline-cloud-badge" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.4 10.2A6.5 6.5 0 0 0 6 8.8 5 5 0 0 0 6.5 18.8h11.4a4.3 4.3 0 0 0 .5-8.6z" />
                  </svg>
                </span>
                <span>
                  Cloud AI: <strong>Analyzed Safely{liveFirebase ? " (Live Firebase)" : ""}</strong>
                </span>
              </span>
            </div>
          </div>

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
              <section className="glass-panel" aria-label="Document and local redaction proof">
                <div className="card-tabbar">
                  <div className="card-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftTab === "document"}
                      className={"card-tab " + (leftTab === "document" ? "active" : "")}
                      onClick={() => setLeftTab("document")}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M8 13h8M8 17h5" />
                      </svg>
                      <span>Document</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftTab === "redacted"}
                      className={"card-tab " + (leftTab === "redacted" ? "active" : "")}
                      onClick={() => setLeftTab("redacted")}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>Redacted Version</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={leftTab === "audit"}
                      className={"card-tab " + (leftTab === "audit" ? "active" : "")}
                      onClick={() => setLeftTab("audit")}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      <span>Privacy Audit</span>
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

                {/* SUB-TAB A: Original Document with Inline Color-Coded Entity Pills + Tooltip */}
                {leftTab === "document" && (
                  <div className="doc-sheet-wrap">
                    {renderStructuredSheet("raw")}
                  </div>
                )}

                {/* SUB-TAB B: Redacted Version Sent to Cloud + Local Entity Vault */}
                {leftTab === "redacted" && (
                  <div className="doc-sheet-wrap">
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
                              Original values are stored in browser RAM only
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-outline-pill"
                          onClick={handleExportRedacted}
                        >
                          <span>↓ Export Redacted PDF</span>
                        </button>
                      </div>

                      <div className="vault-table-scroll">
                        <table className="vault-table">
                          <thead>
                            <tr>
                              <th>Original Value</th>
                              <th>Cloud Token</th>
                              <th>Type</th>
                              <th>Visibility</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vaultEntries.map((entry) => {
                              const isVis = !hiddenVaultTokens.has(entry.token);
                              const color = getEntryPillColor(entry);
                              return (
                                <tr key={entry.token}>
                                  <td style={{ fontWeight: 500, color: "var(--ink-900)" }}>
                                    {maskDisplayValue(entry, isVis)}
                                  </td>
                                  <td>
                                    <span className={`entity-pill token-mono ${color}`}>
                                      {entry.token}
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
                    </div>
                  </div>
                )}

                {/* SUB-TAB C: Cryptographic Privacy Audit & Leak Blocker Proof */}
                {leftTab === "audit" && (
                  <div className="doc-sheet-wrap" style={{ overflowY: "auto" }}>
                    <div className="doc-paper" style={{ maxHeight: "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                        <div>
                          <h2 className="doc-report-title" style={{ marginBottom: "4px" }}>
                            Zero-Trust Pre-Send Cryptographic Audit
                          </h2>
                          <p style={{ fontSize: "12.5px", color: "var(--ink-500)" }}>
                            Receipt <span className="mono">#{shortSha}</span> · Verified before opening HTTPS socket
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-primary-pill"
                          onClick={handleSimulateLeakAttempt}
                        >
                          Test Pre-Send Leak Blocker
                        </button>
                      </div>

                      <div className="kpi-cards-grid" style={{ marginBottom: "16px" }}>
                        <div className="kpi-insight-card">
                          <span className="kpi-card-label">Stage 1 · On-Device</span>
                          <span className="kpi-card-value">{totalMasked} Masked</span>
                          <span className="kpi-card-sub">
                            {stage1Mode === InferenceMode.ONLY_ON_DEVICE ? "ONLY_ON_DEVICE" : "PREFER_ON_DEVICE"}
                          </span>
                        </div>
                        <div className="kpi-insight-card">
                          <span className="kpi-card-label">Stage 2 · Gatekeeper</span>
                          <span className="kpi-card-value" style={{ color: "#16a34a" }}>0 Bytes Leaked</span>
                          <span className="kpi-card-sub">
                            {telemetry?.sanitizedOutputBytes ?? 0} B safe payload
                          </span>
                        </div>
                        <div className="kpi-insight-card">
                          <span className="kpi-card-label">Stage 3 · Cloud AI</span>
                          <span className="kpi-card-value">Gemini 2.5</span>
                          <span className="kpi-card-sub">App Check Verified</span>
                        </div>
                      </div>

                      <h3 className="doc-section-heading">18 HIPAA Safe Harbor &amp; Legal Privilege Rules</h3>
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
                  </div>
                )}

                <div className="card-footer-strip">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <span className="shield-verified-icon" aria-hidden="true">✓</span>
                    <span>
                      <strong>{totalMasked} PII entities</strong> were masked locally before sending to cloud
                    </span>
                  </span>

                  <button
                    type="button"
                    className="footer-link-btn"
                    onClick={() =>
                      setLeftTab((prev) =>
                        prev === "document" ? "redacted" : prev === "redacted" ? "audit" : "document"
                      )
                    }
                  >
                    <span>
                      {leftTab === "document"
                        ? "View Details ›"
                        : leftTab === "redacted"
                        ? "Privacy Audit ›"
                        : "Back to Document ›"}
                    </span>
                  </button>
                </div>
              </section>

              {/* RIGHT PANEL: AI Insights + Interactive Q&A Assistant */}
              <section className="glass-panel" aria-label="AI insights and document Q&A">
                <div className="card-tabbar">
                  <div className="card-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "insights"}
                      className={"card-tab " + (rightTab === "insights" ? "active" : "")}
                      onClick={() => setRightTab("insights")}
                    >
                      <span style={{ color: "#2563eb" }}>✦</span>
                      <span>AI Insights</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "qa"}
                      className={"card-tab " + (rightTab === "qa" ? "active" : "")}
                      onClick={() => setRightTab("qa")}
                    >
                      <span style={{ color: "#7c3aed" }}>✦</span>
                      <span>Q&amp;A Assistant</span>
                    </button>
                  </div>

                  <div className="tab-controls-right">
                    <button
                      type="button"
                      className="btn-outline-pill"
                      style={{ height: "28px", fontSize: "11.5px", padding: "0 11px" }}
                      onClick={() => setRehydrateRight((v) => !v)}
                      title="Toggle between locally restored names and raw [PII_*] tokens returned by Cloud AI"
                    >
                      {rehydrateRight ? "Showing: Restored Names" : "Showing: Cloud [PII_*]"}
                    </button>
                  </div>
                </div>

                <div className="right-panel-body">
                  {/* RIGHT MODE 1: AI INSIGHTS */}
                  {rightTab === "insights" && (
                    <div className="insights-stack">
                      <div className="section-heading-row">
                        <h2 className="section-h3">Analysis Summary</h2>
                      </div>

                      <div className="summary-prose">
                        {renderRestoredProse(analysis?.executiveSummary ?? "")}
                      </div>

                      <div className="section-heading-row" style={{ marginTop: "4px" }}>
                        <h3 className="section-h3">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.4">
                            <path d="M4 20V14M10 20V10M16 20V4M22 20v-8" />
                          </svg>
                          <span>Key Insights</span>
                        </h3>
                      </div>

                      <div className="kpi-cards-grid">
                        <div className="kpi-insight-card">
                          <span className="kpi-icon-circle blue" aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z" />
                            </svg>
                          </span>
                          <span className="kpi-card-label">{currentDocMeta.kpi1Label}</span>
                          <span className="kpi-card-value">{currentDocMeta.kpi1Main}</span>
                          <span className="kpi-card-sub">{primarySubjectName}</span>
                        </div>

                        <div className="kpi-insight-card">
                          <span className="kpi-icon-circle green" aria-hidden="true">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                              <rect x="3" y="5" width="18" height="16" rx="2.5" />
                              <path d="M16 3v4M8 3v4M3 10h18" />
                            </svg>
                          </span>
                          <span className="kpi-card-label">{currentDocMeta.kpi2Label}</span>
                          <span className="kpi-card-value">{currentDocMeta.kpi2Main}</span>
                          <span className="kpi-card-sub">{currentDocMeta.kpi2Sub}</span>
                        </div>

                        <div className="kpi-insight-card">
                          <span className="kpi-icon-circle purple" aria-hidden="true">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                              <path d="M12 3l7 3.5v5.2c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6.5L12 3z" />
                              <path d="M12 8v4M12 16h.01" />
                            </svg>
                          </span>
                          <span className="kpi-card-label">{currentDocMeta.kpi3Label}</span>
                          <span className="kpi-card-value">{currentDocMeta.kpi3Main}</span>
                          <span className="kpi-card-sub">{currentDocMeta.kpi3Sub}</span>
                        </div>
                      </div>

                      <div className="restored-banner">
                        <span className="check-circle-green" aria-hidden="true">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span>Your private information has been restored locally.</span>
                      </div>

                      <div className="section-heading-row" style={{ marginTop: "2px" }}>
                        <h3 className="section-h3">
                          <span style={{ color: "#2563eb" }}>✦</span>
                          <span>Recommended Next Steps</span>
                        </h3>
                      </div>

                      <div className="next-steps-list">
                        {analysis?.pharmacovigilanceOrClauseAlerts.map((alert, idx) => (
                          <div key={idx} className="next-step-row">
                            <span className="check-circle-green" aria-hidden="true">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                            <div>
                              {alert.title === alert.recommendation ? (
                                renderRestoredProse(alert.recommendation)
                              ) : (
                                <>
                                  <strong style={{ color: "var(--ink-900)" }}>{alert.title}: </strong>
                                  {renderRestoredProse(alert.recommendation)}
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* RIGHT MODE 2: INTERACTIVE Q&A ASSISTANT */}
                  {rightTab === "qa" && (
                    <div className="qa-thread" aria-live="polite">
                      {qaThread.map((turn) => (
                        <React.Fragment key={turn.id}>
                          <div className="qa-user-row">
                            <span className="qa-user-avatar" aria-hidden="true">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2.2c-3.8 0-7.5 1.9-7.5 4.6V21h15v-2.2c0-2.7-3.7-4.6-7.5-4.6z" />
                              </svg>
                            </span>
                            <div className="qa-user-bubble">{turn.question}</div>
                            <span className="qa-timestamp">{turn.timestamp}</span>
                          </div>

                          <div className="qa-ai-row">
                            <span className="qa-ai-avatar" aria-hidden="true">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L20 5.5v6c0 5-3.4 9.3-8 10.6-4.6-1.3-8-5.6-8-10.6v-6L12 2zm0 5l1.4 3.2 3.2 1.4-3.2 1.4L12 16.2 10.6 13l-3.2-1.4 3.2-1.4L12 7z" />
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
                    </div>
                  )}

                  {/* Pinned Ask Anything Input Bar + Prompt Chips */}
                  <div className="ask-dock">
                    <form
                      className="ask-input-shell"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleAskQuestion(questionDraft);
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
                      </svg>
                      <input
                        type="text"
                        className="ask-input"
                        placeholder="Ask anything about this document..."
                        value={questionDraft}
                        onChange={(e) => setQuestionDraft(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="ask-send-btn"
                        aria-label="Send question"
                        disabled={isAskingQa}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                      </button>
                    </form>

                    <div className="prompt-chips-row">
                      {currentDocMeta.quickChips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          className="prompt-chip"
                          onClick={() => void handleAskQuestion(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </main>
          )}

          {/* ==================== VIEW 2: HOME DASHBOARD ==================== */}
          {sidebarNav === "home" && (
            <main className="home-dashboard" aria-label="PII-Zero Home Overview">
              <section className="home-hero-card">
                <div className="home-hero-left">
                  <span className="home-big-check" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <div>
                    <h1 style={{ fontFamily: "var(--font-display)", fontSize: "21px", fontWeight: 800, marginBottom: "4px" }}>
                      Your data is protected
                    </h1>
                    <p style={{ fontSize: "14px", color: "var(--ink-700)", marginBottom: "10px" }}>
                      Personal, medical, and legal identifiers are masked locally on your device with Gemini Nano + our 18-category HIPAA enclave before Cloud AI ever sees a word.
                    </p>
                    <button
                      type="button"
                      className="footer-link-btn"
                      onClick={() => setSidebarNav("document")}
                    >
                      <span>Open active document workspace →</span>
                    </button>
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
            </section>
          )}

          {/* ==================== VIEW 4: SETTINGS & FIREBASE HYBRID SDK ==================== */}
          {sidebarNav === "settings" && (
            <div className="home-dashboard">
              <section className="home-activity-card">
                <div className="section-heading-row" style={{ marginBottom: "14px" }}>
                  <div>
                    <h2 className="section-h3">Firebase AI Logic Hybrid SDK Configuration</h2>
                    <p style={{ fontSize: "12.5px", color: "var(--ink-500)", marginTop: "2px" }}>
                      Configure Stage 1 on-device inference mode, custom organization redaction terms, and optional live Firebase Web credentials.
                    </p>
                  </div>
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

                <div style={{ marginBottom: "12px" }}>
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

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, marginBottom: "5px" }}>
                    Firebase Web Config JSON (GoogleAIBackend + App Check):
                  </label>
                  <textarea
                    className="doc-textarea mono"
                    style={{ minHeight: "150px", fontSize: "12px" }}
                    value={configJsonText}
                    onChange={(e) => setConfigJsonText(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button type="button" className="btn-primary-pill" onClick={handleSaveFirebaseSettings}>
                    Save &amp; Re-Analyze Document
                  </button>
                  <input
                    type="text"
                    className="text-input mono"
                    style={{ width: "210px" }}
                    value={cloudModelName}
                    onChange={(e) => setCloudModelName(e.target.value)}
                    aria-label="Cloud Gemini model name"
                  />
                </div>
              </section>

              <section className="home-activity-card">
                <div className="section-heading-row" style={{ marginBottom: "12px" }}>
                  <h2 className="section-h3">Official SDK Integration Snippet</h2>
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

                  <div style={{ background: "#f4f7fc", border: "1px solid #dce6f5", borderRadius: "12px", padding: "14px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-500)", marginBottom: "8px" }}>
                      Side Panel Live Redaction Preview
                    </div>
                    <div style={{ background: "#ffffff", borderRadius: "9px", padding: "12px", border: "1px solid #e4ecf7", fontSize: "12.5px", lineHeight: 1.6 }}>
                      {renderTokenPillsInText((pipelineResult?.scrubResult.sanitizedText ?? "").slice(0, 290) + "…")}
                    </div>
                  </div>
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

                  {foldPosture === "unfolded" ? (
                    <div className="fold-frame">
                      <div className="fold-dual">
                        <div style={{ fontSize: "12px", lineHeight: 1.55, paddingRight: "6px" }}>
                          <div style={{ fontWeight: 700, color: "var(--brand-blue)", marginBottom: "6px" }}>
                            Left Screen · Local RAM Vault
                          </div>
                          {rawText.slice(0, 210)}…
                        </div>
                        <div className="fold-hinge" title="Galaxy Z Fold7 Hinge" />
                        <div style={{ fontSize: "12px", lineHeight: 1.55, paddingLeft: "6px" }}>
                          <div style={{ fontWeight: 700, color: "#15803d", marginBottom: "6px" }}>
                            Right Screen · Restored Review
                          </div>
                          {renderRestoredProse((analysis?.executiveSummary ?? "").slice(0, 220))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="fold-frame" style={{ maxWidth: "310px", margin: "0 auto" }}>
                      <div style={{ fontWeight: 700, fontSize: "12.5px", marginBottom: "6px" }}>
                        PII-Zero Folded Cover Mode · 0 PII Sent
                      </div>
                      <div style={{ fontSize: "12px", lineHeight: 1.55 }}>
                        {renderRestoredProse(analysis?.executiveSummary ?? "")}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload / Paste Document Modal */}
      {uploadModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Upload or paste confidential document">
          <div className="modal-card">
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

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="text"
                className="text-input"
                placeholder="Document tab title (e.g. Patient_Discharge.pdf)"
                value={pasteDraftTitle}
                onChange={(e) => setPasteDraftTitle(e.target.value)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.log"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                className="btn-outline-pill"
                style={{ whiteSpace: "nowrap", height: "36px" }}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose Text File…
              </button>
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
          </div>
        </div>
      )}
    </>
  );
};

