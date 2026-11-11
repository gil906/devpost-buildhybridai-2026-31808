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
  buildHybridModelParams,
  initializePiiZeroFirebase,
  runHybridAirlockPipeline,
  generateSdkCodeSnippet,
  resetPiiZeroFirebaseInstances
} from "../src/engine/firebaseHybridSdk";
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
    } finally {
      server.close();
    }
  });

  it("produces deterministic FIPS 180-4 SHA-256 hashes", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
