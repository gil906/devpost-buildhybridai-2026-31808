# PII-Zero

**Client-side HIPAA & legal PII airlock built on the Firebase AI Logic Hybrid SDK (Web, Chrome MV3 & Android Foldable)**

![PII-Zero Architecture & Hardware Trust Boundary](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/850/403/datas/original.png)

## Why I built this

If a resident pastes a hospital discharge summary into a cloud LLM and asks it to *"redact the patient's name and check for drug interactions,"* the HIPAA violation has already happened. The moment raw Patient Health Information crosses the TLS socket to an external endpoint without a Business Associate Agreement, 45 CFR §164.514(b)(2) is broken—no matter what the prompt asks the model to do afterward. Attorneys reviewing M&A disclosure schedules or litigation term sheets run into the exact same wall under FRE Rule 502 and Rule 408.

On the flip side, running everything on a small local model has its own ceiling. On-device **Gemini Nano** is fast, private, and free of network round-trips, which makes it great at spotting names, dates, MRNs, and case numbers inside a paragraph. What a compact local model cannot reliably do is cross-check renal CrCl dosing kinetics across five concurrent medications, map ICD-10-CM codes, or spot an uncapped consequential-damages carve-out buried in Section 7.4 of a cross-license agreement. **Cloud Gemini 2.5 Flash** handles that reasoning easily, provided you never feed it raw identities.

Most hybrid AI demos treat on-device inference as an offline fallback when Wi-Fi drops. **PII-Zero** uses Firebase AI Logic's hybrid modes (`ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, and `ONLY_IN_CLOUD`) to split the job across the hardware trust boundary:

1. **On-device scrub & volatile RAM vault:** Local inference + a deterministic 18-class HIPAA Safe Harbor and legal privilege scanner replace sensitive spans with numbered, typed placeholders (`[PII_NAME_01]`, `[PII_MRN_01]`, `[PII_SSN_01]`, `[PII_DOCKET_01]`). The lookup table lives strictly in an in-memory `Map`—never `localStorage`, `IndexedDB`, cookies, or server logs.
2. **Pre-socket SHA-256 gatekeeper:** Before `fetch()` or the cloud SDK opens a socket, an independent verifier re-scans the outbound text against both the vault values and all 18 statutory patterns. If a single raw SSN, MRN, phone number, or patient name remains, the request is aborted locally and `0 B` leaves the device.
3. **Cloud Gemini 2.5 Flash synthesis:** Only the tokenized text crosses TLS to `GoogleAIBackend` (`gemini-2.5-flash`), protected by Firebase App Check.
4. **Local token restoration:** When the structured response comes back, the client swaps `[PII_NAME_01]` back to `Elena Rostova` in memory so the clinician or attorney reads a normal, complete brief while Google's cloud prompt logs contain zero personal identifiers.

![PII-Zero Web Workbench — Dark Graphite Chartroom](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/850/404/datas/original.png)

---

## Why numbered tokens matter (`[PII_NAME_01]` vs. `[REDACTED]`)

Early on, I tried flat `[REDACTED]` masks and watched the cloud reasoning fall apart immediately. When an inpatient consult mentions a patient, an attending oncologist, and an emergency contact—or an M&A schedule names Buyer, Seller, and Escrow Agent—turning all three into `[REDACTED]` destroys who prescribed what to whom and makes it impossible to put the names back afterward.

![Coreference-Preserving Tokens vs. Destructive Masks](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/850/407/datas/original.png)

Assigning stable per-session entity numbers solves both problems at once:
- Repeated mentions of the same person normalize to the same token (`Elena Rostova` and `Rostova, Elena` → `[PII_NAME_01]`), so Gemini 2.5 Flash keeps the full relationship graph intact.
- During local restoration, tokens are sorted longest-first before substitution so `[PII_NAME_10]` never collides with `[PII_NAME_1]`.

---

## Three working clients sharing one airlock model

Because clinicians and lawyers work across desktop browsers, web-based EHRs, and mobile/foldable devices on rounds, I built PII-Zero across three surfaces:

### 1. Web Clinical & Legal Workbench (`https://piizero.gilbertcv.com`)
Built with React, TypeScript, Vite, and the official `firebase/ai` Web SDK (`getAI`, `getGenerativeModel`, `GoogleAIBackend`, `InferenceMode`, and `firebase/app-check` with `ReCaptchaEnterpriseProvider`).
- Includes four domain test cases out of the box: an oncology renal-dosing consult (all 18 HIPAA Safe Harbor classes in one note), a cross-border M&A patent settlement (FRE 408), an emergency behavioral health intake (42 CFR Part 2 + QTc prolongation), and an implanted cardiac lead MDL notice (FDA 21 CFR 803).
- A segmented lens switch toggles in real time between **Clinician view (restored)** and **Cloud wire view (`[PII_*]`)** so you can inspect byte-for-byte what crossed the network vs. what was reconstructed locally.
- Supports both **Graphite dark** for low-light clinical stations and **Archival paper** for long contract review.

![Archival Paper Theme — M&A Settlement Review](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/850/408/datas/original.png)

### 2. Wire Boundary Inspector & Leak-Block Test
Clicking **Test leak block** deliberately appends an unredacted SSN (`419-82-6741`) after Stage 1 to prove Stage 2 isn't decorative: the pre-socket gatekeeper catches both the vault match and the raw SSN pattern, aborts network dispatch, and flags the exact leaked bytes before any packet is sent.

![Wire Boundary Inspector & Pre-Socket Leak Block](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/850/406/datas/original.png)

### 3. Chrome MV3 Side Panel Extension & Galaxy Z Fold7 Android App
- **Chrome Extension (`chrome-extension/`):** Uses Manifest V3 `sidePanel`, `contextMenus`, `activeTab`, and `scripting`. Highlighting a clinical note or contract clause on any webpage and right-clicking *Scrub PII & Analyze* pulls the selection into a 360 px side panel, scrubs it locally, and lets you replace the live DOM `<textarea>` inline with one click before pasting into an external tool.
- **Android App (`android/`):** Written in Kotlin with Jetpack Compose, `com.google.firebase:firebase-ai` (`Firebase.ai(backend = GenerativeBackend.googleAI())`), and `androidx.window.layout.FoldingFeature`. On an unfolded **Galaxy Z Fold7**, it renders a hinge-aware two-pane split (raw intake & local vault on the left, restored clinical/legal brief on the right with a 24 dp hinge gutter); on a folded cover screen, it collapses cleanly into a single-column tabbed view.

![Companion Chrome MV3 Side Panel & Galaxy Z Fold7 Posture-Aware App](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/850/405/datas/original.png)

---

## Hard bugs I hit while building it

- **Overlapping spans between regex and NER:** An email like `elena.rostova@patientmail.org` or a URL containing an MRN can match both a person's name and an electronic address. If you replace the name first, you split the email in half (`[PII_NAME_01]@patientmail.org`), leaving a half-redacted fragment behind. I solved this by collecting candidate spans across all 18 rules + custom matter codewords first, resolving overlaps by specificity and span length, and splicing the string in a single reverse-offset pass.
- **Domain misclassification on mixed medical-legal records:** Hospital lien consults contain both oncology lab values (`CrCl 39 mL/min`, `BRCA1`) and legal docket/escrow terms (`Case No. 1:26-cv-04821-JSR`). My initial classifier saw the word *"escrow"* and treated an oncology bleeding-risk consult like a patent settlement—caught during visual screenshot testing and fixed so clinical pharmacovigilance takes precedence whenever medical telemetry is present.
- **Zero-trust server enforcement:** Even the companion Node 22 audit server (`server/server.mjs`) runs `detectRawPiiViolations()` on incoming payloads and returns `HTTP 422 ZERO_PII_AIRLOCK_REJECTED` if a client ever attempts to POST unredacted SSNs, MRNs, emails, or phone numbers.

---

## Try it out

- **Live Web Workbench:** [https://piizero.gilbertcv.com](https://piizero.gilbertcv.com)
- **Source Code (MIT):** [https://github.com/gil906/devpost-buildhybridai-2026-31808](https://github.com/gil906/devpost-buildhybridai-2026-31808)
- **Chrome MV3 Extension Bundle (`.zip`):** [https://piizero.gilbertcv.com/downloads/piizero-chrome-extension.zip](https://piizero.gilbertcv.com/downloads/piizero-chrome-extension.zip)
- **Android Foldable Companion (`.apk`):** [https://piizero.gilbertcv.com/downloads/piizero-android-debug.apk](https://piizero.gilbertcv.com/downloads/piizero-android-debug.apk)
