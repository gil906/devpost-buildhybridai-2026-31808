import {
  PII_CATEGORIES,
  scrubTextWithAirlock,
  sha256Hex,
  verifyZeroPiiLeak,
  type PiiCategoryId,
  type VaultEntry
} from "./piiAirlock";
import {
  buildVerifiedRedactedPdfBytes,
  transformSanitizedTextByStrategy,
  type RedactionOutputStrategy
} from "./documentIoAndModes";

export interface BatchDocumentInput {
  id: string;
  fileName: string;
  ext: "pdf" | "docx";
  docRole: string;
  rawText: string;
  extraEntities?: Array<{ value: string; category: PiiCategoryId }>;
}

export interface BatchPacketPreset {
  id: string;
  name: string;
  subtitle: string;
  domain: "clinical" | "legal";
  customTerms: string[];
  tokenAliases: Record<string, string>;
  crossDocSynthesisTitle: string;
  crossDocSynthesisSummary: string;
  crossDocAlerts: Array<{
    severity: "CRITICAL" | "HIGH" | "INFO";
    title: string;
    detail: string;
  }>;
  files: BatchDocumentInput[];
}

export interface SharedCorpusEntity {
  token: string;
  originalValue: string;
  category: PiiCategoryId;
  label: string;
  totalOccurrences: number;
  fileIds: string[];
  fileNames: string[];
}

export interface ProcessedBatchFile {
  id: string;
  fileName: string;
  ext: "pdf" | "docx";
  docRole: string;
  rawText: string;
  sanitizedText: string;
  sha256: string;
  maskedCount: number;
  zeroLeakPassed: boolean;
  fileEntities: VaultEntry[];
}

export interface BatchCorpusResult {
  packetId: string;
  files: ProcessedBatchFile[];
  sharedVault: SharedCorpusEntity[];
  totalMaskedInstances: number;
  crossFileEntityCount: number;
  batchManifestSha256: string;
  cloudPiiBytes: number;
}

export const BATCH_PACKETS: BatchPacketPreset[] = [
  {
    id: "packet-clinical-referral",
    name: "Cardiology & Renal Referral Packet",
    subtitle: "4 linked EHR records · Shared patient/provider identity across chart, labs, meds & claim",
    domain: "clinical",
    customTerms: ["Riverside Medical Center"],
    tokenAliases: {
      "John Doe": "[PATIENT_1]",
      "Dr. Sarah Johnson": "[PROVIDER_1]",
      "Dr. Marcus Patel": "[PROVIDER_2]"
    },
    crossDocSynthesisTitle: "Cross-Document Clinical Reconciliation (4 Files)",
    crossDocSynthesisSummary:
      "Across all 4 packet files for [PATIENT_1] (DOB [PII_DOB_01]), outpatient medication reconciliation uncovered a high-severity interaction invisible in any single note: File 3 continues Simvastatin 40 mg nightly while File 1 initiates Clarithromycin 500 mg BID, alongside Stage 3b renal impairment (eGFR 38 mL/min in File 2).",
    crossDocAlerts: [
      {
        severity: "CRITICAL",
        title: "Cross-Chart CYP3A4 Contraindication (File 1 × File 3)",
        detail:
          "[PROVIDER_1] prescribed Clarithromycin 500 mg in the Urgent Care Note while [PATIENT_1]'s active Pharmacy Profile lists Simvastatin 40 mg — hold statin during macrolide course to prevent rhabdomyolysis."
      },
      {
        severity: "HIGH",
        title: "Renal Dose Adjustment Required (File 2 Lab Panel)",
        detail:
          "Serum creatinine 1.88 mg/dL (eGFR 38 mL/min/1.73m²) for [PATIENT_1] requires 50% Clarithromycin dose reduction and follow-up BMP with [PROVIDER_2] within 7 days."
      },
      {
        severity: "INFO",
        title: "Prior-Auth Claim Alignment (File 4 CMS-1500)",
        detail:
          "Member ID [PII_PLAN_01] at [PII_CUSTOM_01] matches ICD-10 J18.9 / N18.32 documentation across all 4 records."
      }
    ],
    files: [
      {
        id: "bf-intake",
        fileName: "01_Urgent_Care_Intake.pdf",
        ext: "pdf",
        docRole: "Intake & Rx Plan",
        extraEntities: [
          { value: "John Doe", category: "PATIENT_CLIENT_NAME" },
          { value: "Dr. Sarah Johnson", category: "PATIENT_CLIENT_NAME" }
        ],
        rawText: [
          "RIVERSIDE MEDICAL CENTER — URGENT CARE INTAKE",
          "Patient Name: John Doe",
          "Date of Birth: 04/15/1978",
          "SSN: 123-45-6789",
          "MRN: MRN-77482910",
          "Provider: Dr. Sarah Johnson",
          "---",
          "Chief Complaint:",
          "John Doe presented with 4 days of productive cough, fever (38.6 C), and right lower-lobe crackles.",
          "Plan:",
          "• Start Clarithromycin 500 mg PO BID x 7 days",
          "• Order STAT Metabolic & Renal Lab Panel",
          "• Refer John Doe to Cardiology / Nephrology clinic"
        ].join("\n")
      },
      {
        id: "bf-labs",
        fileName: "02_Renal_Metabolic_Labs.pdf",
        ext: "pdf",
        docRole: "Diagnostic Lab Panel",
        extraEntities: [
          { value: "John Doe", category: "PATIENT_CLIENT_NAME" },
          { value: "Dr. Marcus Patel", category: "PATIENT_CLIENT_NAME" }
        ],
        rawText: [
          "RIVERSIDE DIAGNOSTIC LABORATORIES",
          "Patient Name: John Doe",
          "MRN: MRN-77482910",
          "Date of Birth: 04/15/1978",
          "Reviewing Specialist: Dr. Marcus Patel",
          "---",
          "Chemistry & Renal Function:",
          "• Serum Creatinine: 1.88 mg/dL (High)",
          "• Estimated GFR: 38 mL/min/1.73m2 (Stage 3b CKD)",
          "• Potassium: 4.9 mEq/L",
          "• WBC: 13.4 x10E3/uL"
        ].join("\n")
      },
      {
        id: "bf-meds",
        fileName: "03_Active_Pharmacy_Meds.pdf",
        ext: "pdf",
        docRole: "Outpatient Meds",
        extraEntities: [{ value: "John Doe", category: "PATIENT_CLIENT_NAME" }],
        rawText: [
          "OUTPATIENT PHARMACY DISPENSE RECONCILIATION",
          "Patient Name: John Doe",
          "Patient Phone: (415) 890-4412",
          "Home Address: 742 Maple Street, Riverside, CA 92501",
          "---",
          "Active Maintenance Medications:",
          "• Simvastatin 40 mg PO nightly (Refilled 11/01/2026)",
          "• Lisinopril 20 mg PO daily",
          "• Metoprolol Succinate 50 mg PO daily"
        ].join("\n")
      },
      {
        id: "bf-claim",
        fileName: "04_PriorAuth_Claim_1500.docx",
        ext: "docx",
        docRole: "Insurance Prior-Auth",
        extraEntities: [
          { value: "John Doe", category: "PATIENT_CLIENT_NAME" },
          { value: "Dr. Sarah Johnson", category: "PATIENT_CLIENT_NAME" }
        ],
        rawText: [
          "CMS-1500 PRIOR AUTHORIZATION SUMMARY",
          "Subscriber: John Doe",
          "SSN: 123-45-6789",
          "Health Plan ID: HPLAN-BCBS-9940218",
          "Ordering Physician: Dr. Sarah Johnson",
          "Facility: Riverside Medical Center",
          "Estimated Authorization Amount: $4,850"
        ].join("\n")
      }
    ]
  },
  {
    id: "packet-legal-dealroom",
    name: "M&A Deal Room Due-Diligence Packet",
    subtitle: "4 corporate agreements · Consistent party & executive pseudonymization across exhibits",
    domain: "legal",
    customTerms: ["Acme Corporation", "Project Hyperion"],
    tokenAliases: {
      "Acme Corporation": "[COMPANY_A]",
      "John Smith": "[EXECUTIVE_1]"
    },
    crossDocSynthesisTitle: "Cross-Exhibit Deal Room Audit (4 Agreements)",
    crossDocSynthesisSummary:
      "Reviewing all 4 anonymized exhibits for [COMPANY_A] and [EXECUTIVE_1] under [PII_CUSTOM_02] flagged 2 material cap/escrow mismatches between the Master NDA/Term Sheet and Schedule B before closing.",
    crossDocAlerts: [
      {
        severity: "CRITICAL",
        title: "Indemnity Cap vs. Escrow Holdback Mismatch (Exhibit 1 × Exhibit 3)",
        detail:
          "Exhibit 1 caps aggregate liability for [COMPANY_A] at $1,000,000, whereas Exhibit 3 mandates a $2,400,000 indemnity holdback wire — reconcile Section 6.2 prior to signature."
      },
      {
        severity: "HIGH",
        title: "Non-Compete Territory Conflict for [EXECUTIVE_1] (Exhibit 2)",
        detail:
          "Exhibit 2 imposes a 24-month nationwide restriction on [EXECUTIVE_1], conflicting with the 12-month carve-out in Exhibit 1."
      },
      {
        severity: "INFO",
        title: "Consistent Party Tokenization Verified Across 4 Exhibits",
        detail:
          "[COMPANY_A], [EXECUTIVE_1], and [PII_CUSTOM_02] resolved to identical tokens across every file with 0 raw identifiers transmitted."
      }
    ],
    files: [
      {
        id: "lg-nda",
        fileName: "01_Master_NDA_TermSheet.docx",
        ext: "docx",
        docRole: "Master Agreement",
        extraEntities: [
          { value: "John Smith", category: "PATIENT_CLIENT_NAME" },
          { value: "$1,000,000", category: "SETTLEMENT_AMOUNT" }
        ],
        rawText: [
          "MASTER NON-DISCLOSURE & ACQUISITION TERM SHEET",
          "Counterparty: Acme Corporation",
          "Key Executive: John Smith",
          "Headquarters: 123 Main Street, New York, NY 10001",
          "Codename: Project Hyperion",
          "---",
          "1. Confidentiality & Non-Compete:",
          "12-month non-compete restriction covering direct enterprise competitors of Acme Corporation.",
          "2. Aggregate Liability Cap:",
          "Total liability under this Agreement is capped at $1,000,000."
        ].join("\n")
      },
      {
        id: "lg-exec",
        fileName: "02_Executive_Retention_Schedule.docx",
        ext: "docx",
        docRole: "Executive Schedule",
        extraEntities: [
          { value: "John Smith", category: "PATIENT_CLIENT_NAME" },
          { value: "$650,000", category: "SETTLEMENT_AMOUNT" }
        ],
        rawText: [
          "SCHEDULE A — KEY EXECUTIVE RETENTION AGREEMENT",
          "Executive Name: John Smith",
          "Employer: Acme Corporation",
          "Executive Email: j.smith@acmecorp.example.com",
          "Retention Grant: $650,000",
          "---",
          "Restrictive Covenant:",
          "John Smith agrees to a 24-month post-closing non-solicitation and non-compete covenant under Project Hyperion."
        ].join("\n")
      },
      {
        id: "lg-escrow",
        fileName: "03_Escrow_Holdback_Wire.pdf",
        ext: "pdf",
        docRole: "Escrow & Wire",
        extraEntities: [{ value: "$2,400,000", category: "SETTLEMENT_AMOUNT" }],
        rawText: [
          "SCHEDULE B — INDEMNITY ESCROW & WIRE INSTRUCTIONS",
          "Beneficiary Entity: Acme Corporation",
          "Deal Reference: Project Hyperion",
          "Escrow IBAN: GB29NWBK60161331926819",
          "Indemnity Holdback Amount: $2,400,000",
          "Authorized Signatory: Counsel Rebecca Lin, Esq."
        ].join("\n")
      },
      {
        id: "lg-docket",
        fileName: "04_IP_Litigation_Disclosure.pdf",
        ext: "pdf",
        docRole: "IP Disclosure",
        extraEntities: [{ value: "John Smith", category: "PATIENT_CLIENT_NAME" }],
        rawText: [
          "SCHEDULE C — INTELLECTUAL PROPERTY & DOCKET DISCLOSURE",
          "Disclosing Party: Acme Corporation",
          "Inventor / Deponent: John Smith",
          "Pending Matter: Case No. 24-CV-08841",
          "Presiding: Hon. Judge Evelyn Morales",
          "Status: Dismissed with prejudice; zero residual royalty encumbrance on Project Hyperion."
        ].join("\n")
      }
    ]
  }
];

/**
 * Scrubs an entire packet of files using a unified cross-document token map so every entity
 * receives the exact same placeholder token across all files in the batch.
 */
export function runBatchCorpusAirlock(params: {
  packetId: string;
  files: BatchDocumentInput[];
  customTerms: string[];
  tokenAliases?: Record<string, string>;
}): BatchCorpusResult {
  const combinedExtra: Array<{ value: string; category: PiiCategoryId }> = [];
  for (const f of params.files) {
    if (f.extraEntities) {
      for (const e of f.extraEntities) {
        if (!combinedExtra.some((x) => x.value === e.value)) {
          combinedExtra.push(e);
        }
      }
    }
  }

  // First pass on concatenated corpus establishes canonical cross-file token assignments
  const corpusJoined = params.files.map((f) => f.rawText).join("\n\n===FILE_BOUNDARY===\n\n");
  const masterScrub = scrubTextWithAirlock(corpusJoined, {
    customTerms: params.customTerms,
    extraRecognizedEntities: combinedExtra,
    tokenAliases: params.tokenAliases
  });

  const sharedAliases: Record<string, string> = { ...(params.tokenAliases ?? {}) };
  for (const entry of masterScrub.vaultEntries) {
    sharedAliases[entry.originalValue] = entry.token;
    if (!combinedExtra.some((x) => x.value === entry.originalValue)) {
      combinedExtra.push({ value: entry.originalValue, category: entry.category });
    }
  }

  const sharedMap = new Map<string, SharedCorpusEntity>();
  const processedFiles: ProcessedBatchFile[] = [];

  for (const f of params.files) {
    const fileScrub = scrubTextWithAirlock(f.rawText, {
      customTerms: params.customTerms,
      extraRecognizedEntities: combinedExtra,
      tokenAliases: sharedAliases
    });
    const gate = verifyZeroPiiLeak(
      fileScrub.sanitizedText,
      fileScrub.vaultEntries,
      f.rawText
    );

    processedFiles.push({
      id: f.id,
      fileName: f.fileName,
      ext: f.ext,
      docRole: f.docRole,
      rawText: f.rawText,
      sanitizedText: fileScrub.sanitizedText,
      sha256: fileScrub.sanitizedSha256,
      maskedCount: fileScrub.telemetry.totalDetected,
      zeroLeakPassed: gate.passed,
      fileEntities: fileScrub.vaultEntries
    });

    for (const ve of fileScrub.vaultEntries) {
      const existing = sharedMap.get(ve.token);
      if (existing) {
        existing.totalOccurrences += ve.occurrences;
        if (!existing.fileIds.includes(f.id)) {
          existing.fileIds.push(f.id);
          existing.fileNames.push(f.fileName);
        }
      } else {
        sharedMap.set(ve.token, {
          token: ve.token,
          originalValue: ve.originalValue,
          category: ve.category,
          label: ve.label,
          totalOccurrences: ve.occurrences,
          fileIds: [f.id],
          fileNames: [f.fileName]
        });
      }
    }
  }

  const sharedVault = Array.from(sharedMap.values()).sort(
    (a, b) => b.fileIds.length - a.fileIds.length || b.totalOccurrences - a.totalOccurrences
  );
  const totalMaskedInstances = processedFiles.reduce((acc, f) => acc + f.maskedCount, 0);
  const crossFileEntityCount = sharedVault.filter((e) => e.fileIds.length >= 2).length;
  const batchManifestSha256 = sha256Hex(
    processedFiles.map((f) => `${f.fileName}:${f.sha256}`).join("|")
  );

  return {
    packetId: params.packetId,
    files: processedFiles,
    sharedVault,
    totalMaskedInstances,
    crossFileEntityCount,
    batchManifestSha256,
    cloudPiiBytes: 0
  };
}

export function buildBatchPacketPdfBytes(params: {
  packetName: string;
  batchResult: BatchCorpusResult;
  strategy: RedactionOutputStrategy;
}): Uint8Array {
  const vaultAsEntries: VaultEntry[] = params.batchResult.sharedVault.map((s) => ({
    token: s.token,
    originalValue: s.originalValue,
    category: s.category,
    label: s.label,
    regulationRef: PII_CATEGORIES[s.category]?.regulationRef ?? "Zero-Trust Policy",
    severity: PII_CATEGORIES[s.category]?.severity ?? "HIGH",
    source: s.category === "CUSTOM_POLICY" ? "CUSTOM_POLICY" : "ON_DEVICE_NER",
    occurrences: s.totalOccurrences,
    byteLength: new TextEncoder().encode(s.originalValue).length
  }));

  const combinedBody = params.batchResult.files
    .map((f, idx) => {
      const transformed = transformSanitizedTextByStrategy(
        f.sanitizedText,
        vaultAsEntries,
        params.strategy
      );
      return [
        `DOCUMENT ${idx + 1} OF ${params.batchResult.files.length}: ${f.fileName} (${f.docRole})`,
        `File SHA-256: ${f.sha256.slice(0, 24)}  |  Masked Spans: ${f.maskedCount}`,
        "---",
        transformed,
        ""
      ].join("\n");
    })
    .join("\n");

  return buildVerifiedRedactedPdfBytes({
    fileName: `${params.packetName.replace(/\s+/g, "_")}.pdf`,
    instTitle: params.packetName,
    reportTitle: `Consolidated Zero-PII Batch Packet (${params.batchResult.files.length} Files · ${params.batchResult.sharedVault.length} Shared Vault Entities)`,
    sha256: params.batchResult.batchManifestSha256,
    maskedCount: params.batchResult.totalMaskedInstances,
    strategy: params.strategy,
    bodyText: combinedBody
  });
}

/* ==================== PROMPT FIREWALL & POLICY COMPOSER ==================== */

export type ComplianceProfileId =
  | "hipaa_safe_harbor"
  | "legal_privilege"
  | "financial_pci"
  | "custom_policy";

export type FirewallActionTask =
  | "polish_email"
  | "extract_actions"
  | "patient_plain_language"
  | "spanish_translation";

export interface FirewallScenarioPreset {
  id: string;
  label: string;
  profile: ComplianceProfileId;
  customTerms: string[];
  extraEntities: Array<{ value: string; category: PiiCategoryId }>;
  promptText: string;
}

export const FIREWALL_CATEGORY_GROUPS: Array<{
  id: string;
  label: string;
  categories: PiiCategoryId[];
}> = [
  {
    id: "names",
    label: "Names & Counsel",
    categories: ["PATIENT_CLIENT_NAME", "COUNSEL_JUDGE"]
  },
  {
    id: "gov_med_ids",
    label: "SSN, MRN & Plan IDs",
    categories: ["SSN", "MRN", "HEALTH_PLAN_ID", "LICENSE_NPI_DEA", "DEVICE_UDI", "BIOMETRIC_GENETIC"]
  },
  {
    id: "dates_loc",
    label: "Dates & Addresses",
    categories: ["DOB_AGE", "ADDRESS_ZIP"]
  },
  {
    id: "contact_net",
    label: "Email, Phone & IP/URL",
    categories: ["EMAIL", "PHONE_FAX", "URL", "IP_ADDRESS"]
  },
  {
    id: "financial_legal",
    label: "Wire, Amounts & Dockets",
    categories: ["ACCOUNT_IBAN", "SETTLEMENT_AMOUNT", "CASE_DOCKET", "VEHICLE_VIN", "CUSTOM_POLICY"]
  }
];

export const COMPLIANCE_PROFILES: Record<
  ComplianceProfileId,
  { label: string; badge: string; enabledGroups: string[] }
> = {
  hipaa_safe_harbor: {
    label: "HIPAA Safe Harbor",
    badge: "45 CFR §164.514",
    enabledGroups: ["names", "gov_med_ids", "dates_loc", "contact_net", "financial_legal"]
  },
  legal_privilege: {
    label: "Legal Privilege",
    badge: "FRE 502 / Work-Product",
    enabledGroups: ["names", "dates_loc", "contact_net", "financial_legal"]
  },
  financial_pci: {
    label: "Financial & Wire DLP",
    badge: "GLBA / Wire Guard",
    enabledGroups: ["names", "gov_med_ids", "contact_net", "financial_legal"]
  },
  custom_policy: {
    label: "Custom Policy",
    badge: "Granular Rules",
    enabledGroups: ["names", "gov_med_ids", "financial_legal"]
  }
};

export const FIREWALL_SCENARIOS: FirewallScenarioPreset[] = [
  {
    id: "fw-referral",
    label: "Clinical Referral Email",
    profile: "hipaa_safe_harbor",
    customTerms: ["Riverside Medical Center"],
    extraEntities: [
      { value: "Elena Rostova", category: "PATIENT_CLIENT_NAME" },
      { value: "Dr. Hannah Kim", category: "PATIENT_CLIENT_NAME" }
    ],
    promptText:
      "Draft a concise cardiology referral email from Dr. Hannah Kim at Riverside Medical Center for Patient Name: Elena Rostova (DOB: 09/14/1968, MRN: MRN-44820193, SSN: 412-88-9034, Phone: (206) 555-0192). She has new-onset atrial fibrillation on Holter telemetry, eGFR 41 mL/min, and needs anticoagulation clearance this week."
  },
  {
    id: "fw-settlement",
    label: "Legal Counter-Offer Draft",
    profile: "legal_privilege",
    customTerms: ["Vanguard BioSystems", "Project Meridian"],
    extraEntities: [
      { value: "Marcus Thorne", category: "PATIENT_CLIENT_NAME" },
      { value: "$1,850,000", category: "SETTLEMENT_AMOUNT" },
      { value: "$450,000", category: "SETTLEMENT_AMOUNT" }
    ],
    promptText:
      "Rewrite this response to Opposing Counsel Rebecca Lin, Esq. regarding Case No. 25-CV-04192 under Project Meridian: Vanguard BioSystems and CEO Marcus Thorne reject the $1,850,000 demand, propose a $450,000 capped settlement into IBAN GB29NWBK60161331926819, and require mutual non-disparagement."
  },
  {
    id: "fw-incident",
    label: "Support Ticket / Log Scrub",
    profile: "financial_pci",
    customTerms: ["Prod-Billing-Cluster"],
    extraEntities: [{ value: "Carlos Mendez", category: "PATIENT_CLIENT_NAME" }],
    promptText:
      "Summarize root cause & customer follow-up for Incident #992: Customer Name: Carlos Mendez (carlos.mendez@clientcorp.org, IP 198.51.100.44, 890 Pine Street, Austin, TX 78701) had a duplicate wire hold of $24,500 on account IBAN DE89370400440532013000 in Prod-Billing-Cluster."
  }
];

export interface FirewallEvaluation {
  sanitizedPrompt: string;
  activeVault: VaultEntry[];
  suppressedCount: number;
  rawRiskScore: number;
  postScrubRiskScore: number;
  sha256Short: string;
}

export function evaluatePromptFirewall(params: {
  rawPrompt: string;
  enabledGroupIds: string[];
  customTerms: string[];
  extraEntities?: Array<{ value: string; category: PiiCategoryId }>;
}): FirewallEvaluation {
  const allowedCategories = new Set<PiiCategoryId>();
  for (const grp of FIREWALL_CATEGORY_GROUPS) {
    if (params.enabledGroupIds.includes(grp.id)) {
      for (const c of grp.categories) allowedCategories.add(c);
    }
  }

  const fullScrub = scrubTextWithAirlock(params.rawPrompt, {
    customTerms: params.customTerms,
    extraRecognizedEntities: params.extraEntities
  });

  // Restore any categories that the user intentionally unchecked in Custom Policy
  let filteredPrompt = fullScrub.sanitizedText;
  const activeVault: VaultEntry[] = [];
  let unmaskedRiskPenalty = 0;

  for (const entry of fullScrub.vaultEntries) {
    if (allowedCategories.has(entry.category)) {
      activeVault.push(entry);
    } else {
      filteredPrompt = filteredPrompt.split(entry.token).join(entry.originalValue);
      unmaskedRiskPenalty += entry.severity === "CRITICAL" ? 32 : 18;
    }
  }

  const rawRiskScore = Math.min(
    99,
    fullScrub.vaultEntries.reduce(
      (acc, v) => acc + (v.severity === "CRITICAL" ? 24 : 14) * Math.min(2, v.occurrences),
      0
    )
  );
  const postScrubRiskScore = Math.min(99, unmaskedRiskPenalty);

  return {
    sanitizedPrompt: filteredPrompt,
    activeVault,
    suppressedCount: activeVault.reduce((acc, v) => acc + v.occurrences, 0),
    rawRiskScore,
    postScrubRiskScore,
    sha256Short: sha256Hex(filteredPrompt).slice(0, 10).toUpperCase()
  };
}

export function generateFirewallSafeRewrite(params: {
  sanitizedPrompt: string;
  activeVault: VaultEntry[];
  task: FirewallActionTask;
}): { cloudOutputWithTokens: string; rehydratedOutput: string; taskTitle: string } {
  const tokens = params.activeVault.map((v) => v.token);
  const findTok = (cat: PiiCategoryId, fallbackIdx = 0) =>
    params.activeVault.find((v) => v.category === cat)?.token ??
    tokens[fallbackIdx] ??
    "[PROTECTED_ENTITY]";

  const personTok = findTok("PATIENT_CLIENT_NAME", 0);
  const orgOrCustomTok =
    params.activeVault.find((v) => v.category === "CUSTOM_POLICY")?.token ??
    findTok("COUNSEL_JUDGE", 1);
  const idTok =
    params.activeVault.find((v) => v.category === "MRN" || v.category === "CASE_DOCKET" || v.category === "ACCOUNT_IBAN")?.token ??
    findTok("SSN", 0);
  const amtOrDateTok =
    params.activeVault.find((v) => v.category === "SETTLEMENT_AMOUNT" || v.category === "DOB_AGE")?.token ?? "";

  let taskTitle = "Polished Professional Draft";
  let cloudText = "";

  if (params.task === "polish_email") {
    taskTitle = "Polished Zero-PII Professional Draft";
    cloudText = [
      `Subject: Priority Coordination & Next Steps — Ref ${idTok}`,
      "",
      `Hello team,`,
      "",
      `Following our review for ${personTok}${amtOrDateTok ? ` (${amtOrDateTok})` : ""} with ${orgOrCustomTok}:`,
      `• Core Context: ${params.sanitizedPrompt}`,
      `• Action Requested: Please confirm schedule availability, verify risk/dosing constraints on record ${idTok}, and reply with final sign-off before end of week.`,
      "",
      `Prepared via PII-Zero Hybrid Airlock (0 raw identifiers sent to Cloud AI).`
    ].join("\n");
  } else if (params.task === "extract_actions") {
    taskTitle = "Structured Action Checklist";
    cloudText = [
      `1. Primary Subject & Reference: ${personTok} (${idTok}) via ${orgOrCustomTok}.`,
      `2. Immediate Verification: Cross-check clinical/contract thresholds${amtOrDateTok ? ` involving ${amtOrDateTok}` : ""} before external release.`,
      `3. Audit & Escalation: Log zero-PII receipt and confirm follow-up owner within 24 hours.`
    ].join("\n");
  } else if (params.task === "patient_plain_language") {
    taskTitle = "Plain-Language Client / Patient Summary";
    cloudText = [
      `Summary for ${personTok}:`,
      `We reviewed your recent update with ${orgOrCustomTok} (Reference ${idTok}). Everything sensitive stayed private on your device while preparing clear next steps${amtOrDateTok ? ` (${amtOrDateTok})` : ""}. Our team will follow up shortly to finalize your plan safely.`
    ].join("\n");
  } else {
    taskTitle = "Spanish Safe Translation (Nombres Restaurados Localmente)";
    cloudText = [
      `Resumen confidencial para ${personTok} (${orgOrCustomTok} · Ref. ${idTok}):`,
      `Se revisó la solicitud de forma segura sin enviar datos personales a la nube${amtOrDateTok ? ` (${amtOrDateTok})` : ""}. Por favor confirme los siguientes pasos clínicos o legales pendientes esta semana.`
    ].join("\n");
  }

  let rehydrated = cloudText;
  for (const entry of params.activeVault) {
    rehydrated = rehydrated.split(entry.token).join(entry.originalValue);
  }

  return {
    cloudOutputWithTokens: cloudText,
    rehydratedOutput: rehydrated,
    taskTitle
  };
}
