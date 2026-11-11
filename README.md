# PII-Zero: Zero-Trust Clinical & Legal Hybrid AI Airlock

**#BuildHybridAI 2026 Hackathon Submission (Targeting the USD 10,000 Grand Prize)**
**Live Demo:** https://piizero.gilbertcv.com | https://devpost-buildhybridai-2026-31808.gilbertcv.com
**Repository:** https://github.com/gil906/devpost-buildhybridai-2026-31808

---

## 1. Why Hybrid AI is Architecturally Indispensable for Zero-Trust Privacy

Healthcare clinicians (HIPAA Safe Harbor 45 CFR 164.514(b)(2)) and litigation/transactional counsel (FRE 502 attorney-client privilege & work-product doctrine) face a structural impasse:

- **Cloud-Only LLMs Violate Zero-Trust:** Sending raw Electronic Health Records (EHR) or unredacted M&A / litigation schedules to a cloud API transmits raw Patient Health Information (PHI) and privileged client identities over the wire before any redaction occurs.
- **On-Device-Only SLMs Lack Deep Multi-Document Reasoning:** Sub-4B on-device models (Gemini Nano 4) excel at low-latency entity extraction, structured tagging, and deterministic token replacement at 0 ms network round-trip, but cannot match **Cloud Gemini 2.5 Flash** on complex differential diagnosis synthesis, ICD-10/CPT coding cross-checks, or multi-clause indemnification analysis.

**PII-Zero solves this through a 4-stage Hybrid AI Airlock powered by the Firebase AI Logic Hybrid SDK (firebase/ai & com.google.firebase:firebase-ai):**

1. **Stage 1 — On-Device HIPAA 18 & Legal Privilege Airlock (Gemini Nano 4 / InferenceMode.PREFER_ON_DEVICE):**
   Scrubs all 18 HIPAA Safe Harbor identifiers and FRE 502 legal entities locally on client hardware, replacing them with coreference-preserving typed tokens ([PII_PERSON_1], [PII_SSN_1], [PII_MRN_1], [PII_DOCKET_1], [PII_SETTLEMENT_1]) and storing the reversible mapping exclusively in volatile client memory (**Local Reversible Token Vault**).
2. **Stage 2 — Cryptographic Zero-PII Proof Gatekeeper (SHA-256 Attestation):**
   Verifies residualCount === 0 across all 18 identifier classes and computes a tamper-evident SHA-256 digest of the outbound sanitized bytes before any cloud socket is allowed to open.
3. **Stage 3 — Cloud Gemini 2.5 Flash Deep Synthesis:**
   Performs differential clinical triage, care-plan synthesis, or legal work-product risk audits strictly over the tokenized [PII_*] text.
4. **Stage 4 — Client-Side Token Re-Hydration:**
   Restores [PII_PERSON_1] -> Elena Rostova and [PII_MRN_1] -> MRN-994821A strictly inside the local browser or Android device display.

---

## 2. Multi-Platform Coverage (Web + Chrome Extension MV3 + Foldable Android App)

1. **Chrome Web App Workbench (src/, server/):**
   - Split-ledger audit workstation with real-time Firebase AI Logic mode switching (PREFER_ON_DEVICE, ONLY_ON_DEVICE, ONLY_IN_CLOUD), live token vault inspection, SHA-256 gatekeeper proof verification, and Cloud-View vs. Re-Hydrated Local-View toggle.
2. **Chrome Extension — Manifest V3 Side Panel & Context Menu (chrome-extension/):**
   - Right-click any clinical note or legal clause on an EHR or contract page ("Scrub PII & Analyze via PII-Zero Hybrid Airlock") to scrub on-device and launch the Side Panel.
   - Includes **1-Click Inline Redaction** (content.mjs) to replace active page selections with redacted [PII_*] tokens.
   - Packaged artifact: dist-artifacts/piizero-chrome-extension.zip.
3. **Foldable Android App — Kotlin + Jetpack Compose + FoldingFeature (android/):**
   - Built with com.google.firebase:firebase-ai (Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(...)), FirebaseAppCheck, and androidx.window.layout.WindowInfoTracker / FoldingFeature.
   - **Adaptive Foldable Posture:** Automatically switches between a **2-Pane Hinge-Aware Split Ledger** (24dp hinge clearance) when unfolded on a **Galaxy Z Fold7** and a **Compact 3-Tab Single-Pane Layout** on narrow cover screens.
   - Signed APK artifact: dist-artifacts/piizero-android-debug.apk.

---

## 3. Design System Provenance (designer-mcp)

All three surfaces share a unified dark clinical/legal ledger aesthetic grounded in designer-mcp references (unslop-original-web-baseline, unslop-audit-checklist, recipe-analytics-dashboard, github-mobile-compose-reply, recipe-flutter-adaptive-dashboard):

- **Canvas & Surfaces:** #111C26 primary canvas, #182734 secondary panels, #1D2F3F elevated controls.
- **Borders & Geometry:** Crisp 1px solid #263849 hairline ruled borders, zero decorative blur/glow, zero AI-slop gradients.
- **Semantic Accents:** #8DD6C7 (verified zero-PII safe state & SHA-256 attestation), #F2CB85 (vaulted PII token emphasis), #F07167 (gatekeeper block alert).
- **Typography:** tabular-nums monospace alignment across all token vaults, byte counters, latency readouts, and SHA-256 digests.

---

## 4. Build, Test & Run Instructions

### Web Workbench & Server
  npm install
  npm test
  npm run build
  PORT=8764 npm start

### Chrome Extension (Manifest V3)
  cd chrome-extension
  npm test && npm run build && npm run package:zip

### Android App (Kotlin + Jetpack Compose + Foldable)
  cd android
  ./gradlew testDebugUnitTest assembleDebug --no-daemon
