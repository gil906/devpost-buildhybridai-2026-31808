# PII-Zero: Zero-Trust Clinical & Legal Hybrid AI Airlock

## Inspiration
Clinicians dictating hospital discharge summaries and attorneys reviewing privileged M&A schedules need the deep reasoning power of frontier cloud models (**Gemini 2.5 Flash**), but strict regulatory mandates (**HIPAA Safe Harbor 45 CFR 164.514(b)(2)** and **FRE 502 Attorney-Client Privilege**) forbid transmitting raw patient names, SSNs, Medical Record Numbers (MRNs), docket numbers, or confidential settlement reserves to external cloud endpoints.

Neither cloud-only AI nor on-device-only AI can solve this alone:
- **Cloud-only AI** leaks raw PII/PHI across the network boundary before redaction can happen.
- **On-device-only AI** keeps data local, but compact edge models lack the deep clinical differential and multi-clause legal reasoning capacity of Gemini 2.5 Flash.

**PII-Zero** resolves this paradox by turning **on-device Gemini Nano 4** into a hardware-local **Zero-Trust Privacy Airlock** and **Cloud Gemini 2.5 Flash** into a **Zero-Knowledge Deep Reasoning Engine**, orchestrated via the **Firebase AI Logic Hybrid SDK**.

---

## What It Does
PII-Zero executes a 4-stage cryptographic and hybrid inference pipeline across **Web (https://piizero.gilbertcv.com)**, **Chrome Extension (Manifest V3 Side Panel)**, and **Android (Kotlin + Jetpack Compose with Galaxy Z Fold7 FoldingFeature support)**:

1. **Stage 1 — On-Device HIPAA 18 & Legal Privilege Airlock (InferenceMode.PREFER_ON_DEVICE / ONLY_ON_DEVICE):**
   Scans raw clinical notes or legal contracts locally on the client device, replacing all 18 HIPAA Safe Harbor identifier classes and privileged legal entities with deterministic typed tokens ([PII_PERSON_1], [PII_SSN_1], [PII_MRN_1], [PII_DOCKET_1], [PII_SETTLEMENT_1]). The mapping between tokens and raw values is stored exclusively in a **Client-Only Reversible Token Vault** in volatile local memory.
2. **Stage 2 — Cryptographic Zero-PII Gatekeeper (SHA-256 Attestation):**
   Before any network request can be dispatched, an independent verifier inspects the sanitized payload to prove residualCount === 0 and generates a tamper-evident **SHA-256 attestation digest** of the exact outbound bytes. If even a single unredacted identifier remains, outbound cloud dispatch is hard-blocked.
3. **Stage 3 — Cloud Gemini 2.5 Flash Deep Synthesis (firebase/ai & com.google.firebase:firebase-ai):**
   The sanitized text (containing only [PII_*] tokens) is analyzed by **Gemini 2.5 Flash**, which produces a structured clinical handoff brief or legal risk audit while preserving the placeholder tokens verbatim.
4. **Stage 4 — Client-Side Token Re-Hydration:**
   When the cloud response returns to the device, PII-Zero re-hydrates [PII_PERSON_1] -> Elena Rostova and [PII_MRN_1] -> MRN-994821A on-screen for the authorized clinician or attorney—meaning **the cloud model reasoned over the full case context without ever seeing a single byte of raw PII**.

---

## How We Built It
- **Firebase AI Logic Hybrid Inference SDK:**
  - **Web & Chrome Extension:** Built on firebase/ai (getAI, getGenerativeModel, GoogleAIBackend, InferenceMode.PREFER_ON_DEVICE, InferenceMode.ONLY_ON_DEVICE, InferenceMode.ONLY_IN_CLOUD) paired with Chrome Built-in AI (self.ai.languageModel / LanguageModel Gemini Nano 4 bridge).
  - **Android App:** Built in Kotlin with com.google.firebase:firebase-ai (Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(...)) and FirebaseAppCheck (DebugAppCheckProviderFactory), plus a deterministic local HIPAA/Legal airlock fallback so the APK runs out-of-the-box offline.
- **Chrome Extension (Manifest V3):**
  - Uses sidePanel, contextMenus, activeTab, storage, and scripting permissions.
  - Right-clicking any selection on an EHR or contract page triggers "Scrub PII & Analyze via PII-Zero Hybrid Airlock", and the content script supports **1-Click Inline Replacement** of page form fields with redacted [PII_*] tokens.
- **Foldable-First Android UI (Jetpack Compose + androidx.window:window):**
  - Uses WindowInfoTracker and FoldingFeature to detect device posture in real time. On an unfolded **Galaxy Z Fold7** or tablet, it renders a **2-Pane Hinge-Aware Split Ledger** (24dp hinge clearance). On a compact cover screen, it adapts to a **3-Tab Single-Pane Ledger**.
- **Anti-Slop Clinical Ledger Design System (designer-mcp):**
  - Grounded in unslop-original-web-baseline, unslop-audit-checklist, recipe-analytics-dashboard, and github-mobile-compose-reply: #111C26 slate canvas, #182734 ruled panels, 1px solid #263849 hairline borders, #8DD6C7 safe attestation teal, #F2CB85 amber token badges, and tabular-nums monospace alignment.

---

## Challenges We Ran Into
- **Preserving Coreference Across Redaction:** Generic [REDACTED] masks destroy coreference resolution across multi-party contracts or clinical consult notes. By assigning deterministic entity-indexed tokens ([PII_PERSON_1], [PII_PERSON_2], [PII_MRN_1]), Gemini 2.5 Flash preserves entity relationships accurately and allows lossless local re-hydration.
- **Cryptographic Gatekeeping Before Socket Dispatch:** We added a dedicated post-scrub verifier that re-evaluates all 18 HIPAA identifier patterns and hashes the sanitized payload with SHA-256 before permitting any cloud call.
- **Adaptive Foldable Continuity:** Coordinating layout transitions between a 360px Chrome Side Panel, a narrow smartphone cover screen, and an unfolded Galaxy Z Fold7 2-pane split without visual clutter.

---

## Accomplishments That We Are Proud Of
- **Full 3-Platform Delivery Targeting the Grand Prize:** Web App + Chrome MV3 Side-Panel Extension + Kotlin Compose Foldable Android App.
- **End-to-End Automated Verification:** Unit and build verification passing across Web (vitest + vite build), Chrome Extension (node --test + esbuild + zip), and Android (testDebugUnitTest + assembleDebug).

---

## Try It Links
- **Live Web App:** https://piizero.gilbertcv.com (and https://devpost-buildhybridai-2026-31808.gilbertcv.com)
- **GitHub Repository:** https://github.com/gil906/devpost-buildhybridai-2026-31808
