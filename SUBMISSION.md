![PII-Zero](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/237/datas/original.png)

## The problem

If you work with medical records, legal contracts, or financial paperwork, you can't just paste a document into a cloud AI chat to get a summary. The moment you hit send, a patient's Social Security number or a client's name is already sitting on someone else's server.

Running everything on a small local model has the opposite issue. On-device **Gemini Nano** is private and fast, which makes it great for spotting names, dates, and ID numbers, but it isn't built to review tricky contract liability clauses or cross-check medication risks across a chart. **Cloud Gemini 2.5 Flash** is great at that deeper analysis, and it doesn't actually need to know *who* the person is to do the job.

**PII-Zero** splits the work between both models using **Firebase AI Logic** (`firebase/ai` on web and `com.google.firebase:firebase-ai` on Android). Your device strips out the personal details first, the cloud model analyzes the safe version, and your screen puts the real names back in locally so the answer still reads naturally.

![How PII-Zero works](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/242/datas/original.png)

## How it works

1. **Mask on your device (`InferenceMode.ONLY_ON_DEVICE`):** Gemini Nano paired with a local 18-category HIPAA and legal pattern matcher swaps names, SSNs, addresses, dates, and dollar amounts with simple tags like `[PATIENT_1]`, `[SSN_1]`, or `[COMPANY_A]`. The real values stay in memory (`Map`) for that open tab only and are never saved to disk or `localStorage`.
2. **Check before sending:** Right before a cloud request goes out, PII-Zero scans the outgoing text (and any follow-up chat question) to make sure none of the original values or raw SSNs are still in there. If anything slipped through, the request is blocked locally.
3. **Analyze in the cloud (`InferenceMode.ONLY_IN_CLOUD`):** **Gemini 2.5 Flash** (via Firebase AI Logic `GoogleAIBackend` and Firebase App Check) only sees the tagged text, writes its summary or contract review using those same tags, and sends it back. Your browser then swaps `[PATIENT_1]` back to `John Doe` on screen.

![Medical Record workspace](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/238/datas/original.png)

---

## Why numbered tags instead of black bars

Early on, I tried replacing everything with plain `[REDACTED]`. That fell apart right away on real documents. A medical note mentions both a patient and a doctor, and an NDA has at least two parties. If every name becomes `[REDACTED]`, the cloud model loses track of who owes what to whom, and you have no way to put the right names back afterward.

Numbered tags (`Acme Corporation` -> `[COMPANY_A]`, `John Smith` -> `[EXECUTIVE_1]`) keep those relationships intact for Gemini Flash. You can switch to the **Redacted Version** tab at any time to see the exact text sent to the cloud, toggle individual items in the **Local Entity Vault**, or ask follow-up questions in the **Q&A Assistant** without exposing real names.

![NDA redacted view, Local Vault, and Q&A](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/239/datas/original.png)

---

## Web, Chrome Extension, and Android

I built PII-Zero across the three places I actually open documents:

- **Web App (`https://piizero.gilbertcv.com`):** Built with React, TypeScript, Vite, and the `firebase/ai` Web SDK. Works across desktop, phones, and foldables, with sample medical and NDA docs ready to try right away (or paste your own text and add your Firebase config in Settings).
- **Chrome Side Panel Extension:** A Manifest V3 extension that lets you highlight text on any webpage, scrub it locally in the side panel, and drop the safe version back into the form in one click.
- **Android & Galaxy Z Fold7 App:** Built in Kotlin with Jetpack Compose, `com.google.firebase:firebase-ai`, and Jetpack WindowManager `FoldingFeature` so it adapts between a regular phone screen and an unfolded two-pane layout.

![Mobile and Galaxy Z Fold7 layouts](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/240/datas/original.png)

![Home overview](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/241/datas/original.png)

![Privacy audit and leak blocker](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/243/datas/original.png)

![Chrome extension and Android app](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/853/244/datas/original.png)

---

## Links

- **Live Web App:** [https://piizero.gilbertcv.com](https://piizero.gilbertcv.com)
- **GitHub Repo (MIT):** [https://github.com/gil906/devpost-buildhybridai-2026-31808](https://github.com/gil906/devpost-buildhybridai-2026-31808)
- **Chrome Extension (`.zip`):** [https://piizero.gilbertcv.com/downloads/piizero-chrome-extension.zip](https://piizero.gilbertcv.com/downloads/piizero-chrome-extension.zip)
- **Android App (`.apk`):** [https://piizero.gilbertcv.com/downloads/piizero-android-debug.apk](https://piizero.gilbertcv.com/downloads/piizero-android-debug.apk)
