![PII-Zero Hero Cover](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/237/datas/original.png)
*Cover — PII-Zero keeps personal, medical, and legal identifiers on your device with Gemini Nano while delegating deep reasoning to Cloud Gemini 2.5 Flash through Firebase AI Logic.*

## The problem

If you work with medical records, legal contracts, or financial paperwork, you can't just paste a document into a cloud AI chat to get a summary. The moment you hit send, a patient's Social Security number or a client's name is already sitting on someone else's server.

Running everything on a small local model has the opposite issue. On-device **Gemini Nano** is private and fast, which makes it great for spotting names, dates, and ID numbers, but it isn't built to review tricky contract liability clauses or cross-check medication risks across a multi-file chart. **Cloud Gemini 2.5 Flash** is great at that deeper analysis, and it doesn't actually need to know *who* the person is to do the job.

**PII-Zero** splits the work between both models using **Firebase AI Logic** (`firebase/ai` on Web/Chrome and `com.google.firebase:firebase-ai` on Android). Your device strips out the personal details first, the cloud model analyzes the anonymized version, and your screen puts the real names back in locally so the answer still reads naturally.

![Three-stage Hybrid AI architecture](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/242/datas/original.png)
*Architecture — The diagram above walks through the three stages: (1) local PII scrubbing on the device (`InferenceMode.ONLY_ON_DEVICE`), (2) a pre-send SHA-256 leak gatekeeper that blocks raw identifiers from leaving the browser or phone, and (3) cloud reasoning on Gemini 2.5 Flash (`InferenceMode.ONLY_IN_CLOUD`) followed by in-memory name restoration.*

## Single-document workspace & guided redaction

1. **Mask on your device (`InferenceMode.ONLY_ON_DEVICE`):** Gemini Nano paired with an 18-category HIPAA Safe Harbor and legal pattern matcher swaps names, SSNs, addresses, dates, and dollar amounts with numbered tags like `[PATIENT_1]`, `[SSN_1]`, or `[COMPANY_A]`. Real values stay in memory (`Map`) for that open tab only—never written to disk or `localStorage`. You can also drop real `.pdf`, `.docx`, or `.txt` files into the upload modal, where they are parsed 100% in browser RAM.
2. **Analyze in the cloud & restore locally (`InferenceMode.ONLY_IN_CLOUD`):** **Gemini 2.5 Flash** (via Firebase AI Logic `GoogleAIBackend` + App Check) receives only the tagged text, writes its clinical or legal review using those tags, and returns it so your screen can swap `[PATIENT_1]` back to `John Doe` locally.

![Medical Record workspace](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/238/datas/original.png)
*Medical Record workspace — Left: an outpatient chart with sensitive spans (`John Doe`, DOB, masked SSN, provider) color-coded inline and a dark hover tooltip showing the exact token (`[PATIENT_1]`) sent to the cloud. Right: Gemini 2.5 Flash's clinical summary and KPI cards with `John Doe` and `46-year-old` restored locally in blue pills.*

![Live Hybrid Routing drawer and Guided Phrase Masking](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/854/147/datas/original.png)
*Live Hybrid Routing & Guided Phrase Masking — Clicking the top pipeline pill opens the Firebase AI Logic routing bar so you can switch between **Hybrid (Nano Scrub → Gemini 2.5 Flash)**, **`PREFER_ON_DEVICE` Airlock**, and **Offline Air-Gapped (100% Local · 0 Network)** while viewing live 3-stage SDK telemetry. Highlighting any custom text in the document (such as `"disc herniation"`) pops up **`+ Mask Phrase Locally`** to redact organization-specific phrases on the spot.*

---

## Redaction modes, cross-panel entity linking & zero-PII Q&A

Early on, I tried replacing everything with plain `[REDACTED]`. That fell apart right away on real documents—an NDA has multiple parties and a medical chart has both a patient and doctors. Numbered tags (`Acme Corporation` -> `[COMPANY_A]`, `John Smith` -> `[EXECUTIVE_1]`) preserve who owes what to whom for Gemini Flash while letting PII-Zero support three production output modes: **Smart Tokens**, **Synthetic Alias** (realistic format-preserving pseudonyms like `Meridian Holdings Inc.`), and **Blackout** (`████████`), plus genuine paginated `.PDF` export.

![NDA redacted view, cross-panel linking, and Q&A proof](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/854/148/datas/original.png)
*NDA Redacted view & Q&A Assistant — Hovering `[COMPANY_A]` on the left highlights `[COMPANY_A]` in the **Local Entity Vault** and **`Acme Corporation`** inside the right-hand Q&A answer at the same time. Right under the user's question, a green proof badge (`Sent to Cloud as: … [COMPANY_A]?`) confirms that follow-up chat questions are also scrubbed locally before leaving the device.*

---

## Batch Studio: multi-file packets with a shared cross-document vault

Doctors and lawyers rarely review a single page in isolation—a referral packet includes an intake note, renal labs, pharmacy meds, and an insurance claim, and an M&A deal room spans multiple exhibits. If each file is redacted separately, the same person can end up with mismatched tokens across files.

![Batch Studio multi-document queue and shared vault](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/854/149/datas/original.png)
*Batch Studio — This left-sidebar workspace scrubs entire 4-file clinical or M&A packets using a **Shared Cross-Document Vault**, assigning `John Doe` (`[PATIENT_1]`) the exact same token across all four files. Hovering an entity in the shared vault lights up every queued file card containing that person, while the right panel surfaces cross-file clinical/contract conflicts (such as an antibiotic in File 1 interacting with a statin listed only in File 3) and exports a consolidated redacted `.PDF` packet.*

---

## Prompt Firewall: live outbound AI firewall & safe composer

For everyday emails, referral letters, prior-auth appeals, or incident logs that staff want to draft or translate with AI, I added a dedicated **Prompt Firewall** section in the left sidebar.

![Prompt Firewall and Safe Cloud AI Composer](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/854/153/datas/original.png)
*Prompt Firewall — Choose a compliance profile (**HIPAA Safe Harbor**, **Legal Privilege**, **Financial & Wire DLP**, or **Custom** category switches) and toggle between **Auto-Mask** and **Strict Block**. As you type, the left pane drops exposure from `Raw Risk: 99/100` to `Post-Firewall Exposure: 0/100` and shows the exact payload allowed out, while the right pane runs safe Cloud Gemini 2.5 tasks (*Polish Professional Draft*, *Extract Action Checklist*, *Plain-Language Summary*, or *Spanish Translation*) and restores real names locally.*

---

## Pre-send leak blocker & session audit history

![Privacy audit and pre-send leak blocker](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/243/datas/original.png)
*Privacy Audit & Leak Blocker — The **Privacy Audit** tab records a SHA-256 verification receipt before any HTTPS request opens, breaks down detections across all 18 HIPAA Safe Harbor and legal privilege rules, and includes a **`Test Pre-Send Leak Blocker`** button that injects a raw SSN into an outgoing payload to prove the request is aborted locally (`0` bytes sent).*

![Home overview and recent audit activity](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/241/datas/original.png)
*Home Overview — Clicking the PII-Zero shield opens a clean overview showing active protection status, sample clinical and legal documents ready to inspect in one click, and shortcuts to upload a file, ask a zero-PII question, or test the leak blocker.*

---

## Web, Chrome Extension, and Android / Galaxy Z Fold7

I built PII-Zero across the three places I actually open documents:

- **Web App (`https://piizero.gilbertcv.com`):** Built with React, TypeScript, Vite, and the `firebase/ai` Web SDK across desktop, phones, and foldables.
- **Chrome Side Panel Extension:** A Manifest V3 extension that lets you highlight text inside any hospital EHR or legal portal, scrub it locally in the side panel, and insert the safe version in one click.
- **Android & Galaxy Z Fold7 App:** Built in Kotlin with Jetpack Compose, `com.google.firebase:firebase-ai`, and Jetpack WindowManager `FoldingFeature` so it adapts between a single-hand phone layout and an unfolded dual-screen posture.

![Smartphone and unfolded Galaxy Z Fold7 showcase](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/240/datas/original.png)
*Mobile & Foldable Responsive UI — Left: compact phone layout with a dark tap-to-peek bar and horizontal document switcher (`0px` overflow). Right: unfolded **Galaxy Z Fold7** posture keeping the masked document and locally restored Gemini review side by side.*

![Chrome Side Panel extension and native Android app](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/244/datas/original.png)
*Companion Apps — Downloadable **Chrome MV3 Side Panel extension** (left) and native **Android / Galaxy Z Fold7 APK** (right) sharing the same on-device scrub + cloud Gemini 2.5 Flash workflow.*

---

## Links

- **Live Web App:** [https://piizero.gilbertcv.com](https://piizero.gilbertcv.com)
- **GitHub Repo (MIT):** [https://github.com/gil906/devpost-buildhybridai-2026-31808](https://github.com/gil906/devpost-buildhybridai-2026-31808)
- **Chrome Extension (`.zip`):** [https://piizero.gilbertcv.com/downloads/piizero-chrome-extension.zip](https://piizero.gilbertcv.com/downloads/piizero-chrome-extension.zip)
- **Android App (`.apk`):** [https://piizero.gilbertcv.com/downloads/piizero-android-debug.apk](https://piizero.gilbertcv.com/downloads/piizero-android-debug.apk)
