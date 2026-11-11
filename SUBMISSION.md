## Why I built this

Doctors and lawyers want to use Gemini on discharge notes and contracts, but pasting a real patient chart or M&A term sheet into a cloud prompt breaks privacy rules the instant it leaves the browser. Asking a cloud model to "ignore the patient's name and check for drug interactions" is already too late because the raw name and Social Security number just crossed the network.

Running everything on a tiny local model has the opposite problem. On-device **Gemini Nano** is fast and private, which makes it great at spotting names, dates, medical record numbers, and docket IDs locally. What a small local model struggles to do is cross-check kidney dosing across five medications or catch an uncapped liability clause buried in Section 7.4 of a contract. **Cloud Gemini 2.5 Flash** is great at that deeper analysis, as long as it never sees who the patient or client actually is.

Instead of treating on-device AI as just an offline fallback when Wi-Fi drops, **PII-Zero** uses Firebase AI Logic's hybrid modes (`ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, and `ONLY_IN_CLOUD`) so each model does the job it is actually suited for.

![How PII-Zero Keeps Sensitive Records Private](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/851/099/datas/original.png)

## How it works in 3 simple steps

1. **Spot and hide private info locally (On-Device):** Gemini Nano paired with an 18-category HIPAA Safe Harbor and legal privilege scanner replaces names, SSNs, MRNs, addresses, and dollar figures with numbered tags like `[PII_NAME_01]` and `[PII_SSN_01]`. The original values stay in a temporary JavaScript `Map` in device RAM (never saved to disk, cookies, or `localStorage`).
2. **Verify zero leaks before sending:** Right before opening a network request, a pre-send check scans the outgoing text one more time. If even one raw SSN, phone number, or patient name slipped through, the call is blocked on the spot and 0 bytes leave the device.
3. **Analyze in Cloud Gemini 2.5 Flash and restore locally:** Google Cloud only receives the safe placeholder version, flags drug interactions or contract risks, and returns its answer using those same `[PII_*]` tags. Your browser or phone then swaps the real names back in locally so you read a normal, clear report.

![PII-Zero 1-2-3 Document Studio on an Oncology Consult](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/851/098/datas/original.png)

---

## Why numbered placeholders beat `[REDACTED]`

When I first tested plain `[REDACTED]` bars, multi-person documents fell apart right away. Hospital notes mention a patient, an attending doctor, and a spouse. Contracts name a Buyer, a Seller, and an Escrow Agent. Turning everyone into `[REDACTED]` makes the cloud model lose track of who did what, and makes it impossible to restore the real names afterward.

![Why Numbered Placeholders Beat Flat REDACTED Bars](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/851/107/datas/original.png)

Giving each unique person or ID a consistent numbered tag (`Elena Rostova` always maps to `[PII_NAME_01]`) keeps every relationship clear for Cloud Gemini 2.5 Flash. On the way back, replacing longest tags first (`[PII_NAME_10]` before `[PII_NAME_1]`) prevents prefix mix-ups.

![Legal M&A Settlement Review in PII-Zero](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/851/105/datas/original.png)

---

## Built for Web, Chrome Side Panel, and Android Foldables

Because clinicians and attorneys move between desktop web apps, hospital EHR forms, and phones or tablets, I built three clients around the same core engine:

- **Web Document Studio (`https://piizero.gilbertcv.com`):** Built with React, TypeScript, Vite, and the official `firebase/ai` SDK (`getAI`, `getGenerativeModel`, `GoogleAIBackend`, `InferenceMode`, plus Firebase App Check). Shows all three stages side by side (`1. Your Private Document` -> `2. What Google Cloud Sees` -> `3. Gemini 2.5 Flash Review`), includes four realistic medical and legal test cases, and has a one-click **Test Leak Blocker** button to watch the pre-send check catch an unredacted SSN live.
- **Chrome Side Panel Extension (`chrome-extension/`):** A Manifest V3 extension using `sidePanel`, `contextMenus`, and `scripting`. Highlight text in any web form, right-click to scrub locally in the 360px side panel, and replace the form field with the safe redacted copy in one click.
- **Android & Galaxy Z Fold7 App (`android/`):** Written in Kotlin with Jetpack Compose, `com.google.firebase:firebase-ai`, and Jetpack WindowManager `FoldingFeature`. On an unfolded Galaxy Z Fold7, it splits cleanly across the hinge (private note on the left screen, restored Gemini review on the right); on a folded phone screen, it switches to a clean single-column view.

![Pre-Send Leak Blocker and Local RAM Vault](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/851/106/datas/original.png)

![Chrome Side Panel Extension and Android Galaxy Z Fold7 App](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/851/109/datas/original.png)

---

## Tricky bugs I ran into and fixed

- **Emails and URLs getting split in half:** An email like `elena.rostova@patientmail.org` contains both a person's name and an email address. Replacing the name first produced broken leftovers like `[PII_NAME_01]@patientmail.org`. Collecting all candidate matches across all 18 rules first, picking the longest/most specific match when ranges overlap, and splicing from the end of the string backward fixed it cleanly.
- **Mixed medical-lien notes confusing the classifier:** Hospital lien records contain both lab values (`CrCl 39 mL/min`, `BRCA1`) and legal docket numbers (`Case No. 1:26-cv-04821-JSR`). At first, seeing the word "escrow" made the analyzer treat an oncology bleeding-risk consult like a patent contract. Prioritizing clinical lab signals whenever medications and vital signs are present solved that bug.
- **Server-side backstop:** Even the companion Node 22 verification endpoint (`server/server.mjs`) checks incoming text and returns `HTTP 422` if a client ever tries to send raw SSNs, MRNs, emails, or phone numbers.

---

## Try it out

- **Live Web Studio:** [https://piizero.gilbertcv.com](https://piizero.gilbertcv.com)
- **GitHub Repository (MIT):** [https://github.com/gil906/devpost-buildhybridai-2026-31808](https://github.com/gil906/devpost-buildhybridai-2026-31808)
- **Chrome Extension (`.zip`):** [https://piizero.gilbertcv.com/downloads/piizero-chrome-extension.zip](https://piizero.gilbertcv.com/downloads/piizero-chrome-extension.zip)
- **Android App (`.apk`):** [https://piizero.gilbertcv.com/downloads/piizero-android-debug.apk](https://piizero.gilbertcv.com/downloads/piizero-android-debug.apk)
