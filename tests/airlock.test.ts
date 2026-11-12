import { describe, it, expect, afterAll } from "vitest";
import {
  PII_CATEGORIES,
  CLINICAL_LEGAL_PRESETS,
  scrubTextWithAirlock,
  verifyZeroPiiLeak,
  rehydrateCloudResponse,
  generateStructuredClinicalLegalAnalysis,
  sha256Hex,
  type PiiCategoryId
} from "../src/engine/piiAirlock";
import {
  InferenceMode,
  InferenceSource,
  DEFAULT_DEMO_FIREBASE_CONFIG,
  buildHybridModelParams,
  initializePiiZeroFirebase,
  runHybridAirlockPipeline,
  askHybridDocumentQuestion,
  generateSdkCodeSnippet,
  resetPiiZeroFirebaseInstances
} from "../src/engine/firebaseHybridSdk";
import {
  buildVerifiedRedactedPdfBytes,
  extractPdfTextFromBytes,
  scrubQuestionWithVaultPreview,
  transformSanitizedTextByStrategy
} from "../src/engine/documentIoAndModes";
import {
  BATCH_PACKETS,
  COMPLIANCE_PROFILES,
  FIREWALL_SCENARIOS,
  buildBatchPacketPdfBytes,
  evaluatePromptFirewall,
  generateFirewallSafeRewrite,
  runBatchCorpusAirlock
} from "../src/engine/batchAndFirewall";
// @ts-expect-error ESM server module
import { createAirlockServer } from "../server/server.mjs";

describe("PII-Zero Hybrid AI Airlock Engine & 18-Category HIPAA/Legal Scrubber", () => {
  afterAll(async () => {
    await resetPiiZeroFirebaseInstances();
  });

  it("redacts all 18 HIPAA Safe Harbor + Legal privilege categories in Preset #1", () => {
    const preset1 = CLINICAL_LEGAL_PRESETS[0];
    const result = scrubTextWithAirlock(preset1.rawDocument, {
      customTerms: preset1.defaultCustomTerms
    });

    const detectedCategories = new Set<PiiCategoryId>(
      result.vaultEntries.map((entry) => entry.category)
    );

    const expected18Categories: PiiCategoryId[] = [
      "PATIENT_CLIENT_NAME",
      "SSN",
      "MRN",
      "DOB_AGE",
      "PHONE_FAX",
      "EMAIL",
      "ADDRESS_ZIP",
      "HEALTH_PLAN_ID",
      "ACCOUNT_IBAN",
      "LICENSE_NPI_DEA",
      "VEHICLE_VIN",
      "DEVICE_UDI",
      "URL",
      "IP_ADDRESS",
      "CASE_DOCKET",
      "COUNSEL_JUDGE",
      "SETTLEMENT_AMOUNT",
      "BIOMETRIC_GENETIC"
    ];

    for (const cat of expected18Categories) {
      expect(detectedCategories.has(cat), `Expected category ${cat} to be redacted`).toBe(true);
    }
    expect(detectedCategories.has("CUSTOM_POLICY")).toBe(true);
    expect(Object.keys(PII_CATEGORIES).length).toBeGreaterThanOrEqual(18);

    // Ensure raw sensitive strings do not appear in sanitized output
    expect(result.sanitizedText).not.toContain("Elena Rostova");
    expect(result.sanitizedText).not.toContain("419-82-6741");
    expect(result.sanitizedText).not.toContain("MRN-88492014");
    expect(result.sanitizedText).not.toContain("elena.rostova@patientmail.org");
    expect(result.sanitizedText).not.toContain("$1,450,000.00");
  });

  it("mathematically reconciles telemetry ledger across all 4 clinical and legal presets", () => {
    expect(CLINICAL_LEGAL_PRESETS.length).toBe(4);
    for (const preset of CLINICAL_LEGAL_PRESETS) {
      const res = scrubTextWithAirlock(preset.rawDocument, {
        customTerms: preset.defaultCustomTerms
      });
      const { telemetry, zeroLeakProof } = res;

      expect(telemetry.totalDetected).toBe(
        telemetry.redactedOnDeviceCount + telemetry.customPolicyCount
      );
      expect(telemetry.cloudPiiBytesTransmitted).toBe(0);
      expect(zeroLeakProof.passed).toBe(true);
      expect(zeroLeakProof.cloudPiiBytes).toBe(0);
      expect(telemetry.reconciled).toBe(true);
      expect(res.rawSha256).toHaveLength(64);
      expect(res.sanitizedSha256).toHaveLength(64);
      expect(res.rawSha256).not.toBe(res.sanitizedSha256);
    }
  });

  it("verifyZeroPiiLeak passes on clean sanitized payloads and fails when raw PII leaks", () => {
    const preset = CLINICAL_LEGAL_PRESETS[0];
    const res = scrubTextWithAirlock(preset.rawDocument, {
      customTerms: preset.defaultCustomTerms
    });

    const cleanCheck = verifyZeroPiiLeak(res.sanitizedText, res.vaultEntries, res.rawText);
    expect(cleanCheck.passed).toBe(true);
    expect(cleanCheck.leakedTokens).toHaveLength(0);
    expect(cleanCheck.cloudPiiBytes).toBe(0);

    // Inject raw patient name and an unvaulted SSN
    const leakedPayload = res.sanitizedText + " Leaked Patient Elena Rostova and SSN 999-11-2222";
    const failedCheck = verifyZeroPiiLeak(leakedPayload, res.vaultEntries, res.rawText);
    expect(failedCheck.passed).toBe(false);
    expect(failedCheck.leakedTokens.length).toBeGreaterThanOrEqual(2);
    expect(failedCheck.cloudPiiBytes).toBeGreaterThan(0);
  });

  it("rehydrates cloud analysis placeholders accurately from the reversible local vault", () => {
    const preset = CLINICAL_LEGAL_PRESETS[0];
    const scrub = scrubTextWithAirlock(preset.rawDocument, {
      customTerms: preset.defaultCustomTerms
    });
    const analysis = generateStructuredClinicalLegalAnalysis(
      scrub.sanitizedText,
      scrub.vaultEntries
    );

    // Cloud narrative should contain [PII_NAME_01] and not "Elena Rostova"
    expect(analysis.rehydratableNarrativeReport).toContain("[PII_NAME_01]");
    expect(analysis.rehydratableNarrativeReport).not.toContain("Elena Rostova");

    const rehydrated = rehydrateCloudResponse(
      analysis.rehydratableNarrativeReport,
      scrub.vaultEntries
    );
    expect(rehydrated.restoredCount).toBeGreaterThan(0);
    expect(rehydrated.rehydratedText).toContain("Elena Rostova");
    expect(rehydrated.rehydratedText).toContain("MRN-88492014");
    expect(rehydrated.rehydratedText).not.toContain("[PII_NAME_01]");
  });

  it("routes Firebase AI Logic Hybrid SDK InferenceMode (ONLY_ON_DEVICE, PREFER_ON_DEVICE, ONLY_IN_CLOUD)", async () => {
    const onlyOnDeviceParams = buildHybridModelParams(InferenceMode.ONLY_ON_DEVICE, "gemini-2.5-flash");
    expect(onlyOnDeviceParams.mode).toBe("only_on_device");
    expect(onlyOnDeviceParams.inCloudParams?.model).toBe("gemini-2.5-flash");

    const preferOnDeviceParams = buildHybridModelParams(InferenceMode.PREFER_ON_DEVICE, "gemini-2.5-flash");
    expect(preferOnDeviceParams.mode).toBe("prefer_on_device");

    const onlyInCloudParams = buildHybridModelParams(InferenceMode.ONLY_IN_CLOUD, "gemini-2.5-flash");
    expect(onlyInCloudParams.mode).toBe("only_in_cloud");

    const ctx = initializePiiZeroFirebase(undefined, InferenceMode.PREFER_ON_DEVICE);
    expect(ctx.configuredMode).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(ctx.stage1Model).toBeDefined();
    expect(ctx.stage3CloudModel).toBeDefined();

    const pipeline = await runHybridAirlockPipeline({
      rawText: CLINICAL_LEGAL_PRESETS[1].rawDocument,
      customTerms: CLINICAL_LEGAL_PRESETS[1].defaultCustomTerms,
      stage1Mode: InferenceMode.PREFER_ON_DEVICE
    });
    expect(pipeline.stage1Telemetry.effectiveInferenceSource).toBe(InferenceSource.ON_DEVICE);
    expect(pipeline.stage2Telemetry.cloudPiiBytes).toBe(0);
    expect(pipeline.stage3Telemetry.effectiveInferenceSource).toBe(InferenceSource.IN_CLOUD);
    expect(pipeline.rehydratedNarrative.rehydratedText).toContain("Hendrik Van Der Berg");

    const snippet = generateSdkCodeSnippet(InferenceMode.ONLY_ON_DEVICE, "gemini-2.5-flash");
    expect(snippet).toContain("InferenceMode.ONLY_ON_DEVICE");
    expect(snippet).toContain("InferenceMode.ONLY_IN_CLOUD");
  });

  it("serves HTTP /health, /api/airlock/verify-zero-pii, and rejects raw PII on /api/airlock/analyze-sanitized", async () => {
    const server = createAirlockServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const healthResp = await fetch(`${baseUrl}/health`);
      expect(healthResp.status).toBe(200);
      const healthJson = (await healthResp.json()) as { status: string; zeroPiiAirlock: boolean };
      expect(healthJson.status).toBe("ok");
      expect(healthJson.zeroPiiAirlock).toBe(true);

      // Reject raw SSN on /api/airlock/analyze-sanitized
      const badResp = await fetch(`${baseUrl}/api/airlock/analyze-sanitized`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sanitizedText: "Unredacted SSN 419-82-6741 in payload" })
      });
      expect(badResp.status).toBe(422);

      // Accept sanitized payload
      const goodResp = await fetch(`${baseUrl}/api/airlock/analyze-sanitized`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sanitizedText: "Patient [PII_NAME_01] with record [PII_MRN_01] presented with febrile neutropenia.",
          vaultTokens: [{ token: "[PII_NAME_01]", category: "PATIENT_CLIENT_NAME" }]
        })
      });
      expect(goodResp.status).toBe(200);
      const goodJson = (await goodResp.json()) as { zeroPiiVerified: boolean };
      expect(goodJson.zeroPiiVerified).toBe(true);

      // Reject raw PII in /api/airlock/ask-sanitized question
      const badQa = await fetch(`${baseUrl}/api/airlock/ask-sanitized`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sanitizedText: "Agreement for [PII_NAME_01]",
          sanitizedQuestion: "Check SSN 419-82-6741"
        })
      });
      expect(badQa.status).toBe(422);

      // Accept sanitized Q&A request and verify local question scrubbing + restoration
      const goodQa = await fetch(`${baseUrl}/api/airlock/ask-sanitized`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sanitizedText: "Patent cross-license agreement for [PII_NAME_01] under [PII_CUSTOM_01].",
          sanitizedQuestion: "Are there any risky clauses for [PII_CUSTOM_01]?",
          vaultTokens: [
            { token: "[PII_NAME_01]", category: "PATIENT_CLIENT_NAME" },
            { token: "[PII_CUSTOM_01]", category: "CUSTOM_POLICY" }
          ]
        })
      });
      expect(goodQa.status).toBe(200);
      const qaJson = (await goodQa.json()) as { zeroPiiVerified: boolean; sections: unknown[] };
      expect(qaJson.zeroPiiVerified).toBe(true);
      expect(qaJson.sections.length).toBeGreaterThan(0);

      // Verify client-side askHybridDocumentQuestion scrubs raw names in the user's question and restores them locally
      const preset2 = CLINICAL_LEGAL_PRESETS[1];
      const scrub2 = scrubTextWithAirlock(preset2.rawDocument, { customTerms: preset2.defaultCustomTerms });
      const clientQa = await askHybridDocumentQuestion({
        sanitizedDocumentText: scrub2.sanitizedText,
        rawQuestion: "Are there any liability carve-outs for Aetheris Robotics GmbH or Hendrik Van Der Berg?",
        vaultEntries: scrub2.vaultEntries
      });
      expect(clientQa.sanitizedQuestion).not.toContain("Aetheris Robotics GmbH");
      expect(clientQa.sanitizedQuestion).not.toContain("Hendrik Van Der Berg");
      expect(clientQa.sections.some((s) => s.restoredBody.includes("SN-ROBO-774109"))).toBe(true);
    } finally {
      server.close();
    }
  });

  it("produces deterministic FIPS 180-4 SHA-256 hashes", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("supports Synthetic Alias & Blackout redaction strategies, question preview scrubbing, and valid PDF 1.4 export/extraction", async () => {
    const raw =
      "Patient Name: John Doe\nSSN: 123-45-6789\nAgreement with Acme Corporation.";
    const scrub = scrubTextWithAirlock(raw, {
      extraRecognizedEntities: [{ value: "Acme Corporation", category: "CUSTOM_POLICY" }],
      tokenAliases: { "John Doe": "[PATIENT_1]", "Acme Corporation": "[COMPANY_A]" }
    });

    const synth = transformSanitizedTextByStrategy(
      scrub.sanitizedText,
      scrub.vaultEntries,
      "synthetic_alias"
    );
    expect(synth).not.toContain("John Doe");
    expect(synth).not.toContain("123-45-6789");
    expect(synth).toContain("Elena Vance");
    expect(synth).toContain("Meridian Holdings Inc.");

    const blackout = transformSanitizedTextByStrategy(
      scrub.sanitizedText,
      scrub.vaultEntries,
      "legal_blackout"
    );
    expect(blackout).toContain("████████");
    expect(blackout).not.toContain("John Doe");

    const qPreview = scrubQuestionWithVaultPreview(
      "Are there any risky clauses for Acme Corp or John Doe?",
      scrub.vaultEntries
    );
    expect(qPreview).toBe(
      "Are there any risky clauses for [COMPANY_A] or [PATIENT_1]?"
    );

    const pdfBytes = buildVerifiedRedactedPdfBytes({
      fileName: "Medical Record.pdf",
      instTitle: "Riverside Medical Center",
      reportTitle: "Patient Medical Report",
      sha256: scrub.sanitizedSha256,
      maskedCount: scrub.telemetry.totalDetected,
      strategy: "smart_tokens",
      bodyText: scrub.sanitizedText
    });
    const pdfAscii = new TextDecoder("latin1").decode(pdfBytes);
    expect(pdfAscii.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdfAscii.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdfAscii).not.toContain("John Doe");
    expect(pdfAscii).not.toContain("123-45-6789");

    const roundTrip = await extractPdfTextFromBytes(pdfBytes);
    expect(roundTrip).toContain("PII-ZERO VERIFIED REDACTED EXPORT");
    expect(roundTrip).toContain("[PATIENT_1]");
  });

  it("maintains consistent shared tokens across Batch Studio files and enforces Prompt Firewall policies", () => {
    const clinicalPacket = BATCH_PACKETS[0];
    const batch = runBatchCorpusAirlock({
      packetId: clinicalPacket.id,
      files: clinicalPacket.files,
      customTerms: clinicalPacket.customTerms,
      tokenAliases: clinicalPacket.tokenAliases
    });

    expect(batch.files.length).toBe(4);
    expect(batch.files.every((f) => f.zeroLeakPassed)).toBe(true);
    expect(batch.cloudPiiBytes).toBe(0);
    expect(batch.crossFileEntityCount).toBeGreaterThanOrEqual(3);

    const johnShared = batch.sharedVault.find((e) => e.originalValue === "John Doe");
    expect(johnShared?.token).toBe("[PATIENT_1]");
    expect(johnShared?.fileIds.length).toBe(4);

    const packetPdf = buildBatchPacketPdfBytes({
      packetName: clinicalPacket.name,
      batchResult: batch,
      strategy: "smart_tokens"
    });
    const packetAscii = new TextDecoder("latin1").decode(packetPdf);
    expect(packetAscii.startsWith("%PDF-1.4\n")).toBe(true);
    expect(packetAscii).not.toContain("John Doe");
    expect(packetAscii).not.toContain("123-45-6789");

    // Prompt Firewall evaluation + local rehydration
    const scenario = FIREWALL_SCENARIOS[0];
    const fwFull = evaluatePromptFirewall({
      rawPrompt: scenario.promptText,
      enabledGroupIds: COMPLIANCE_PROFILES.hipaa_safe_harbor.enabledGroups,
      customTerms: scenario.customTerms,
      extraEntities: scenario.extraEntities
    });
    expect(fwFull.rawRiskScore).toBeGreaterThan(50);
    expect(fwFull.postScrubRiskScore).toBe(0);
    expect(fwFull.sanitizedPrompt).not.toContain("Elena Rostova");
    expect(fwFull.sanitizedPrompt).not.toContain("412-88-9034");

    const rewrite = generateFirewallSafeRewrite({
      sanitizedPrompt: fwFull.sanitizedPrompt,
      activeVault: fwFull.activeVault,
      task: "polish_email"
    });
    expect(rewrite.cloudOutputWithTokens).not.toContain("Elena Rostova");
    expect(rewrite.rehydratedOutput).toContain("Elena Rostova");
  });

  it("strips Firebase App Check debug tokens and raw credential editors from client config and GUI", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    expect("appCheckDebugToken" in DEFAULT_DEMO_FIREBASE_CONFIG).toBe(false);
    expect(DEFAULT_DEMO_FIREBASE_CONFIG.recaptchaEnterpriseSiteKey).toBe("");

    const snippet = generateSdkCodeSnippet(InferenceMode.ONLY_ON_DEVICE, "gemini-2.5-flash");
    expect(snippet).toContain("import.meta.env.VITE_FIREBASE_API_KEY");
    expect(snippet).not.toContain("appCheckDebugToken");

    const appSource = fs.readFileSync(path.resolve(__dirname, "../src/App.tsx"), "utf8");
    expect(appSource).not.toContain("configJsonText");
    expect(appSource).not.toContain("Firebase Web Config JSON");
    expect(appSource).not.toContain("appCheckDebugToken");
    expect(appSource).not.toContain('label: "SDK"');
    expect(appSource).not.toContain('sidebarNav === "settings"');
  });

  it("answers different questions distinctly and differentiates Hybrid, Prefer-On-Device, and Local-Only modes", async () => {
    const rawMedical = [
      "Riverside Medical Center",
      "Patient Name: John Doe",
      "Date of Birth: 04/15/1978",
      "SSN: 123-45-6789",
      "Visit Summary: Patient presented with ongoing back pain and was evaluated for possible disc herniation. Recommended follow-up in 3 months.",
      "Provider: Dr. Sarah Johnson",
      "Date of Visit: 10/23/2024",
      "Treatment Plan: Continue current medication, Physical therapy recommended, Follow-up appointment in 3 months."
    ].join("\n");

    const scrub = scrubTextWithAirlock(rawMedical, {
      extraRecognizedEntities: [
        { value: "John Doe", category: "PATIENT_CLIENT_NAME" },
        { value: "Dr. Sarah Johnson", category: "PATIENT_CLIENT_NAME" }
      ],
      tokenAliases: {
        "John Doe": "[PATIENT_1]",
        "04/15/1978": "[DOB_1]",
        "123-45-6789": "[SSN_1]",
        "Dr. Sarah Johnson": "[PROVIDER_1]",
        "10/23/2024": "[VISIT_DATE_1]"
      }
    });

    const qaWho = await askHybridDocumentQuestion({
      sanitizedDocumentText: scrub.sanitizedText,
      rawQuestion: "Who is the attending doctor?",
      vaultEntries: scrub.vaultEntries,
      routingPolicy: "hybrid_cloud"
    });
    const qaWhen = await askHybridDocumentQuestion({
      sanitizedDocumentText: scrub.sanitizedText,
      rawQuestion: "When is the follow-up scheduled?",
      vaultEntries: scrub.vaultEntries,
      routingPolicy: "hybrid_cloud"
    });
    const qaFindings = await askHybridDocumentQuestion({
      sanitizedDocumentText: scrub.sanitizedText,
      rawQuestion: "What are the key findings and diagnosis?",
      vaultEntries: scrub.vaultEntries,
      routingPolicy: "hybrid_cloud"
    });
    const qaSsn = await askHybridDocumentQuestion({
      sanitizedDocumentText: scrub.sanitizedText,
      rawQuestion: "Was the SSN redacted and safe?",
      vaultEntries: scrub.vaultEntries,
      routingPolicy: "hybrid_cloud"
    });

    expect(qaWho.sections[0].heading).not.toBe(qaWhen.sections[0].heading);
    expect(qaWhen.sections[0].heading).not.toBe(qaFindings.sections[0].heading);
    expect(qaFindings.sections[0].heading).not.toBe(qaSsn.sections[0].heading);
    expect(qaWho.sections.some((s) => s.restoredBody.includes("Dr. Sarah Johnson"))).toBe(true);

    // Same question across 3 different routing policies produces distinct mode badges, sources, and intros
    const modeHybrid = await askHybridDocumentQuestion({
      sanitizedDocumentText: scrub.sanitizedText,
      rawQuestion: "What are the key findings?",
      vaultEntries: scrub.vaultEntries,
      routingPolicy: "hybrid_cloud"
    });
    const modePreferLocal = await askHybridDocumentQuestion({
      sanitizedDocumentText: scrub.sanitizedText,
      rawQuestion: "What are the key findings?",
      vaultEntries: scrub.vaultEntries,
      routingPolicy: "prefer_on_device"
    });
    const modeAirgapped = await askHybridDocumentQuestion({
      sanitizedDocumentText: scrub.sanitizedText,
      rawQuestion: "What are the key findings?",
      vaultEntries: scrub.vaultEntries,
      routingPolicy: "airgapped_local_only"
    });

    expect(modeHybrid.engineBadge).not.toBe(modePreferLocal.engineBadge);
    expect(modePreferLocal.engineBadge).not.toBe(modeAirgapped.engineBadge);
    expect(modeHybrid.inferenceSource).toBe("in_cloud");
    expect(modeAirgapped.inferenceSource).toBe("on_device");
    expect(modeHybrid.intro).not.toBe(modeAirgapped.intro);
    expect(modeHybrid.sections[0].heading).not.toBe(modeAirgapped.sections[0].heading);

    // Verify official firebase/ai GenerativeModel.generateContent executes across ONLY_ON_DEVICE, PREFER_ON_DEVICE, and ONLY_IN_CLOUD
    const server = createAirlockServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const ctx = initializePiiZeroFirebase();
      expect(ctx.onlyOnDeviceModel).toBeDefined();
      expect(ctx.preferOnDeviceModel).toBeDefined();
      expect(ctx.stage3CloudModel).toBeDefined();
      expect(ctx.auth).toBeNull();

      const prompt = [
        "Routing Mode: hybrid_cloud",
        "Question: Who is the attending doctor?",
        "Document:\n" + scrub.sanitizedText
      ].join("\n");

      const localRes = await ctx.onlyOnDeviceModel.generateContent(prompt);
      expect(localRes.response.inferenceSource).toBe(InferenceSource.ON_DEVICE);
      expect(localRes.response.text()).toContain("###");

      const preferRes = await ctx.preferOnDeviceModel.generateContent(prompt, { baseUrl });
      expect(preferRes.response.inferenceSource).toBe(InferenceSource.IN_CLOUD);
      expect(preferRes.response.text()).toContain("[PROVIDER_1]");

      const cloudRes = await ctx.stage3CloudModel.generateContent(prompt, { baseUrl });
      expect(cloudRes.response.inferenceSource).toBe(InferenceSource.IN_CLOUD);
      expect(cloudRes.response.text()).toContain("[PROVIDER_1]");
    } finally {
      server.close();
    }
  });
});
