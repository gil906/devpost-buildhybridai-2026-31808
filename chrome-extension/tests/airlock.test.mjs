import test from "node:test";
import assert from "node:assert/strict";
import {
  scrubText,
  verifyZeroPiiGatekeeper,
  rehydrateResponse,
  runHybridAirlockPipeline,
  InferenceMode
} from "../src/airlock-core.mjs";

test("scrubText de-identifies HIPAA 18 identifiers and builds reversible token vault", () => {
  const raw =
    "Patient: Elena Rostova (DOB: 1981-04-19, SSN: 412-88-9041, MRN-994821A) contacted via (415) 890-3312 and elena.rostova@bayhealth.org at 742 Evergreen Avenue, Suite 4B.";
  const res = scrubText(raw, { domain: "clinical" });

  assert.equal(res.redactedText.includes("412-88-9041"), false);
  assert.equal(res.redactedText.includes("MRN-994821A"), false);
  assert.equal(res.redactedText.includes("elena.rostova@bayhealth.org"), false);
  assert.equal(res.redactedText.includes("Elena Rostova"), false);
  assert.ok(res.redactedText.includes("[PII_SSN_1]"));
  assert.ok(res.redactedText.includes("[PII_MRN_1]"));
  assert.ok(res.redactedText.includes("[PII_EMAIL_1]"));
  assert.ok(res.redactedText.includes("[PII_PERSON_1]"));
  assert.ok(res.uniqueTokenCount >= 6);
});

test("verifyZeroPiiGatekeeper passes sanitized payload and rejects leaked SSN/MRN", async () => {
  const raw = "Client: Viktor Kovalenko, Matter #2026-CV-88412, SSN 551-22-9104, Settlement $2,450,000.00";
  const scrubbed = scrubText(raw, { domain: "legal" });

  const cleanCheck = await verifyZeroPiiGatekeeper(scrubbed.redactedText);
  assert.equal(cleanCheck.passed, true);
  assert.equal(cleanCheck.residualCount, 0);
  assert.match(cleanCheck.sha256Attestation, /^[a-f0-9]{64}$/);

  const leakedCheck = await verifyZeroPiiGatekeeper(
    scrubbed.redactedText + " leaked raw SSN 551-22-9104"
  );
  assert.equal(leakedCheck.passed, false);
  assert.ok(leakedCheck.residualCount >= 1);
});

test("rehydrateResponse restores client vault tokens into cloud response", () => {
  const raw = "Patient: Elena Rostova (MRN-994821A) scheduled on 2026-11-15.";
  const scrubbed = scrubText(raw);
  const cloudDraft =
    "Follow-up confirmed for [PII_PERSON_1] under record [PII_MRN_1] on [PII_DATE_1].";
  const hydrated = rehydrateResponse(cloudDraft, scrubbed.tokenVault);

  assert.ok(hydrated.hydratedText.includes("Elena Rostova"));
  assert.ok(hydrated.hydratedText.includes("MRN-994821A"));
  assert.ok(hydrated.hydratedText.includes("2026-11-15"));
  assert.equal(hydrated.restoredTokenCount, 3);
});

test("runHybridAirlockPipeline executes end-to-end across PREFER_ON_DEVICE and ONLY_ON_DEVICE", async () => {
  const raw =
    "Patient: Marcus Chen (SSN: 319-44-8120, MRN-44019B) admitted 2026-11-09 with atrial flutter.";
  const resPrefer = await runHybridAirlockPipeline(raw, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    domain: "clinical"
  });

  assert.equal(resPrefer.gatekeeper.passed, true);
  assert.ok(resPrefer.cloudRedactedSummary.includes("[PII_PERSON_1]"));
  assert.ok(resPrefer.rehydratedSummary.includes("Marcus Chen"));
  assert.ok(resPrefer.restoredTokenCount >= 1);

  const resLocalOnly = await runHybridAirlockPipeline(raw, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    domain: "legal"
  });
  assert.equal(resLocalOnly.mode, InferenceMode.ONLY_ON_DEVICE);
  assert.equal(resLocalOnly.gatekeeper.passed, true);
});
