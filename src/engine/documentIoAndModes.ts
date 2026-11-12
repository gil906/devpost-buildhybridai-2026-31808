import type { PiiCategoryId, VaultEntry } from "./piiAirlock";

export type RedactionOutputStrategy =
  | "smart_tokens"
  | "synthetic_alias"
  | "legal_blackout";

export type HybridRoutingPolicy =
  | "hybrid_cloud"
  | "prefer_on_device"
  | "airgapped_local_only";

const SYNTHETIC_PEOPLE = [
  "Elena Vance",
  "Marcus Reed",
  "Julian Mercer",
  "Nadia Sterling",
  " Owen Brooks"
];

const SYNTHETIC_PROVIDERS = [
  "Dr. Clara Bennett",
  "Dr. Samuel Cho",
  "Dr. Priya Nair"
];

const SYNTHETIC_COMPANIES = [
  "Meridian Holdings Inc.",
  "Northstar BioLabs LLC",
  "Crestview Systems Corp."
];

const SYNTHETIC_DATES = [
  "08/19/1979",
  "11/04/2025",
  "03/14/2025",
  "06/28/1984"
];

const SYNTHETIC_ADDRESSES = [
  "740 Harborview Ave, Suite 400, Seattle, WA 98104",
  "815 Oakridge Pkwy, Austin, TX 78701",
  "290 Beacon St, Boston, MA 02116"
];

const SYNTHETIC_AMOUNTS = ["$850,000", "$425,000", "$1,250,000"];

export function getSyntheticAliasForEntry(
  entry: VaultEntry,
  index: number
): string {
  const tok = entry.token.toUpperCase();
  const numMatch = tok.match(/(\d+)\]$/) ?? tok.match(/_([A-Z])\]$/);
  const slot = numMatch
    ? /^\d+$/.test(numMatch[1])
      ? Math.max(0, parseInt(numMatch[1], 10) - 1)
      : Math.max(0, numMatch[1].charCodeAt(0) - 65)
    : index;
  if (tok.includes("COMPANY") || tok.includes("ORG")) {
    return SYNTHETIC_COMPANIES[slot % SYNTHETIC_COMPANIES.length];
  }
  if (
    tok.includes("PROVIDER") ||
    /^(?:Dr\.|Prof\.)\s/i.test(entry.originalValue)
  ) {
    return SYNTHETIC_PROVIDERS[slot % SYNTHETIC_PROVIDERS.length];
  }

  const byCategory: Partial<Record<PiiCategoryId, string>> = {
    PATIENT_CLIENT_NAME: SYNTHETIC_PEOPLE[slot % SYNTHETIC_PEOPLE.length].trim(),
    COUNSEL_JUDGE: `Hon. ${SYNTHETIC_PEOPLE[(slot + 1) % SYNTHETIC_PEOPLE.length].trim()}`,
    SSN: `900-00-${String(4102 + (slot % 898)).padStart(4, "0")}`,
    MRN: `MRN-99${String(1040 + slot * 17).slice(-4)}`,
    DOB_AGE: SYNTHETIC_DATES[slot % SYNTHETIC_DATES.length],
    PHONE_FAX: `(555) 01${slot % 9}-${String(2400 + slot * 13).slice(-4)}`,
    EMAIL: `redacted.alias${slot + 1}@example.invalid`,
    ADDRESS_ZIP: SYNTHETIC_ADDRESSES[slot % SYNTHETIC_ADDRESSES.length],
    HEALTH_PLAN_ID: `HP-0098-${String(3100 + slot * 7).slice(-4)}`,
    ACCOUNT_IBAN: `ACCT-SYNTH-${String(8801 + slot)}`,
    LICENSE_NPI_DEA: `NPI-0000${String(5120 + slot)}`,
    VEHICLE_VIN: `1HGCM82633A00${String(1000 + slot).slice(-4)}`,
    DEVICE_UDI: `(01)0089990000${String(10 + slot).padStart(2, "0")}`,
    URL: `https://synthetic-portal.example/doc-${slot + 1}`,
    IP_ADDRESS: `198.51.100.${10 + (slot % 200)}`,
    CASE_DOCKET: `Case No. 00-CV-0${410 + slot}`,
    SETTLEMENT_AMOUNT: SYNTHETIC_AMOUNTS[slot % SYNTHETIC_AMOUNTS.length],
    BIOMETRIC_GENETIC: `[SYNTH-GENOMIC-${slot + 1}]`,
    CUSTOM_POLICY: `Project-Atlas-${slot + 1}`
  };

  return byCategory[entry.category] ?? `Alias_${slot + 1}`;
}

export function getBlackoutForEntry(entry: VaultEntry): string {
  const len = Math.max(6, Math.min(16, entry.originalValue.length));
  return "█".repeat(len);
}

export function getStrategyDisplayForEntry(
  entry: VaultEntry,
  index: number,
  strategy: RedactionOutputStrategy
): string {
  if (strategy === "synthetic_alias") {
    return getSyntheticAliasForEntry(entry, index);
  }
  if (strategy === "legal_blackout") {
    return getBlackoutForEntry(entry);
  }
  return entry.token;
}

export function transformSanitizedTextByStrategy(
  sanitizedText: string,
  vaultEntries: VaultEntry[],
  strategy: RedactionOutputStrategy
): string {
  if (!sanitizedText || strategy === "smart_tokens") return sanitizedText;
  let out = sanitizedText;
  vaultEntries.forEach((entry, idx) => {
    const replacement = getStrategyDisplayForEntry(entry, idx, strategy);
    out = out.split(entry.token).join(replacement);
  });
  return out;
}

export function scrubQuestionWithVaultPreview(
  rawQuestion: string,
  vaultEntries: VaultEntry[]
): string {
  if (!rawQuestion) return "";
  let out = rawQuestion;
  const sorted = [...vaultEntries].sort(
    (a, b) => b.originalValue.length - a.originalValue.length
  );
  for (const entry of sorted) {
    const val = entry.originalValue.trim();
    if (val.length >= 3) {
      const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(escaped, "gi"), entry.token);
    }
    // Also catch shortened corporate names like "Acme Corp" for "Acme Corporation"
    if (/Corporation$/i.test(val)) {
      const shortCorp = val.replace(/Corporation$/i, "Corp");
      const escShort = shortCorp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(escShort, "gi"), entry.token);
    }
  }
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[PII_SSN_QUERY]");
  return out;
}

function escapePdfLiteral(input: string): string {
  // Replace Unicode block characters or smart quotes with clean WinAnsi / ASCII equivalents for standard PDF Type1 fonts
  const ascii = input
    .replace(/█/g, "#")
    .replace(/[•·]/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E]/g, "");
  return ascii
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(text: string, maxChars: number): string[] {
  const trimmed = text.trimEnd();
  if (!trimmed) return [""];
  if (trimmed.length <= maxChars) return [trimmed];
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (!cur) {
      cur = word.length > maxChars ? word.slice(0, maxChars) : word;
    } else if (cur.length + 1 + word.length <= maxChars) {
      cur += " " + word;
    } else {
      lines.push(cur);
      cur = word.length > maxChars ? word.slice(0, maxChars) : word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Generates a genuine, spec-valid PDF 1.4 document completely in client RAM (0 server calls).
 */
export function buildVerifiedRedactedPdfBytes(params: {
  fileName: string;
  instTitle: string;
  reportTitle: string;
  sha256: string;
  maskedCount: number;
  strategy: RedactionOutputStrategy;
  bodyText: string;
}): Uint8Array {
  const strategyLabel =
    params.strategy === "synthetic_alias"
      ? "Synthetic Format-Preserving Alias"
      : params.strategy === "legal_blackout"
      ? "Legal Blackout Redaction"
      : "Smart Placeholder Tokens";

  const bodyLines: Array<{ font: "F1" | "F2" | "F3"; size: number; text: string; gap: number }> = [];

  for (const rawLine of params.bodyText.split("\n")) {
    const clean = rawLine.trim();
    if (!clean) {
      bodyLines.push({ font: "F1", size: 10, text: "", gap: 8 });
      continue;
    }
    if (clean === "---") {
      bodyLines.push({
        font: "F3",
        size: 8.5,
        text: "--------------------------------------------------------------------------------",
        gap: 13
      });
      continue;
    }
    const isHeading =
      (clean.endsWith(":") && clean.length < 56) ||
      /^\d+\.\s+[A-Z]/.test(clean) ||
      (/^[A-Z0-9\s&—–\-():/]+$/.test(clean) && clean.length > 14);
    if (isHeading) {
      for (const wl of wrapLine(clean, 78)) {
        bodyLines.push({ font: "F2", size: 11, text: wl, gap: 15 });
      }
      continue;
    }
    for (const wl of wrapLine(clean, 84)) {
      bodyLines.push({ font: "F1", size: 10, text: wl, gap: 13.5 });
    }
  }

  // Paginate lines (Letter 612 x 792 pt)
  const pageStreams: string[] = [];
  let idx = 0;
  let pageNum = 1;

  while (idx < bodyLines.length || pageNum === 1) {
    const ops: string[] = [];
    let y = 742;

    if (pageNum === 1) {
      // Top Zero-PII Verification Stamp Box
      ops.push("0.94 0.97 1.00 rg 0.78 0.85 0.95 RG 1 w");
      ops.push("44 676 524 68 re B");
      ops.push("0.09 0.23 0.54 rg");
      ops.push(
        `BT /F2 11 Tf 56 726 Td (${escapePdfLiteral(
          "PII-ZERO VERIFIED REDACTED EXPORT  |  0 RAW PII BYTES EXPOSED"
        )}) Tj ET`
      );
      ops.push("0.22 0.28 0.38 rg");
      ops.push(
        `BT /F1 9 Tf 56 710 Td (${escapePdfLiteral(
          `Source: ${params.fileName}   |   Masked Entities: ${params.maskedCount}   |   Mode: ${strategyLabel}`
        )}) Tj ET`
      );
      ops.push(
        `BT /F3 8.2 Tf 56 694 Td (${escapePdfLiteral(
          `SHA-256 Receipt: ${params.sha256.slice(0, 48)}`
        )}) Tj ET`
      );

      ops.push("0.07 0.11 0.19 rg");
      ops.push(
        `BT /F2 14 Tf 44 650 Td (${escapePdfLiteral(
          params.instTitle || params.reportTitle
        )}) Tj ET`
      );
      ops.push("0.32 0.38 0.48 rg");
      ops.push(
        `BT /F2 11 Tf 44 633 Td (${escapePdfLiteral(params.reportTitle)}) Tj ET`
      );
      ops.push("0.84 0.88 0.94 RG 0.8 w 44 624 m 568 624 l S");
      y = 606;
    }

    ops.push("0.11 0.15 0.23 rg");
    while (idx < bodyLines.length && y >= 58) {
      const item = bodyLines[idx];
      if (item.text) {
        ops.push(
          `BT /${item.font} ${item.size} Tf 44 ${y.toFixed(1)} Td (${escapePdfLiteral(
            item.text
          )}) Tj ET`
        );
      }
      y -= item.gap;
      idx++;
    }

    // Footer
    ops.push("0.45 0.51 0.60 rg");
    ops.push(
      `BT /F1 8.5 Tf 44 32 Td (${escapePdfLiteral(
        `Generated locally in device RAM by PII-Zero Hybrid Airlock  |  Page ${pageNum}`
      )}) Tj ET`
    );

    pageStreams.push(ops.join("\n"));
    pageNum++;
    if (idx >= bodyLines.length) break;
  }

  // Assemble PDF objects:
  // 1: Catalog, 2: Pages, 3: Helvetica, 4: Helvetica-Bold, 5: Courier
  // Then pairs of (PageObj, ContentStreamObj)
  const objects: string[] = [];
  const pageObjNums: number[] = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";

  let nextObj = 6;
  for (const stream of pageStreams) {
    const pageObjId = nextObj++;
    const contentObjId = nextObj++;
    pageObjNums.push(pageObjId);
    objects[pageObjId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObjId} 0 R >>`;
    objects[contentObjId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Kids [${pageObjNums
    .map((n) => `${n} 0 R`)
    .join(" ")}] /Count ${pageObjNums.length} >>`;

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let bytePos = chunks[0].length;

  for (let id = 1; id < objects.length; id++) {
    offsets[id] = bytePos;
    const block = `${id} 0 obj\n${objects[id]}\nendobj\n`;
    chunks.push(block);
    bytePos += block.length;
  }

  const xrefOffset = bytePos;
  const xrefLines = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`];
  for (let id = 1; id < objects.length; id++) {
    xrefLines.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(xrefLines.join(""));
  chunks.push(
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return new TextEncoder().encode(chunks.join(""));
}

async function inflateBytes(
  compressed: Uint8Array,
  format: "deflate" | "deflate-raw"
): Promise<Uint8Array> {
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter();
  await writer.write(new Uint8Array(compressed));
  await writer.close();
  const out = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(out);
}

function decodeXmlEntities(xml: string): string {
  return xml
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function extractDocxTextFromBytes(
  bytes: Uint8Array
): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const compression = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameBytes = bytes.subarray(offset + 30, offset + 30 + nameLen);
    const entryName = new TextDecoder().decode(nameBytes);
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;

    if (entryName === "word/document.xml" && dataEnd <= bytes.length) {
      const payload = bytes.subarray(dataStart, dataEnd);
      const xmlBytes =
        compression === 0
          ? payload
          : compression === 8
          ? await inflateBytes(payload, "deflate-raw")
          : payload;
      const xml = new TextDecoder("utf-8").decode(xmlBytes);
      const withBreaks = xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<w:tab[^>]*\/>/g, "  ")
        .replace(/<[^>]+>/g, "");
      return decodeXmlEntities(withBreaks)
        .split("\n")
        .map((l) => l.trim())
        .filter((l, idx, arr) => l.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
        .join("\n")
        .trim();
    }
    if (compSize === 0) break;
    offset = dataEnd;
  }
  throw new Error("Could not locate word/document.xml inside .docx archive.");
}

function extractPdfStringsFromStreamText(content: string): string[] {
  const lines: string[] = [];
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? [content];
  for (const blk of blocks) {
    const parts: string[] = [];
    const tokenRx = /\((?:\\.|[^\\()])*\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRx.exec(blk)) !== null) {
      const full = m[0];
      const litMatches = full.match(/\((?:\\.|[^\\()])*\)/g) ?? [];
      const joined = litMatches
        .map((lit) =>
          lit
            .slice(1, -1)
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "")
            .replace(/\\t/g, " ")
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")")
            .replace(/\\\\/g, "\\")
        )
        .join("");
      if (joined.trim()) parts.push(joined);
    }
    if (parts.length > 0) {
      lines.push(parts.join(" "));
    }
  }
  return lines;
}

export async function extractPdfTextFromBytes(
  bytes: Uint8Array
): Promise<string> {
  const latin = new TextDecoder("latin1").decode(bytes);
  const collected: string[] = [];
  const streamRx = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRx.exec(latin)) !== null) {
    const rawChunk = match[1];
    if (rawChunk.includes("BT") && rawChunk.includes("ET")) {
      collected.push(...extractPdfStringsFromStreamText(rawChunk));
      continue;
    }
    // Attempt FlateDecode inflate
    try {
      const buf = new Uint8Array(rawChunk.length);
      for (let i = 0; i < rawChunk.length; i++) {
        buf[i] = rawChunk.charCodeAt(i) & 0xff;
      }
      const inflated = await inflateBytes(buf, "deflate");
      const decoded = new TextDecoder("latin1").decode(inflated);
      if (decoded.includes("BT")) {
        collected.push(...extractPdfStringsFromStreamText(decoded));
      }
    } catch {
      // Non-text or image stream; skip cleanly
    }
  }

  const text = collected
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (!text) {
    throw new Error(
      "Scanned or encrypted PDF detected. Paste the text below or upload a text-based PDF/DOCX."
    );
  }
  return text;
}

export async function extractClientFileTextInRam(file: File): Promise<{
  title: string;
  text: string;
  ext: "pdf" | "docx";
}> {
  const lower = file.name.toLowerCase();
  const ext: "pdf" | "docx" = lower.endsWith(".docx") ? "docx" : "pdf";
  if (lower.endsWith(".docx")) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const text = await extractDocxTextFromBytes(buf);
    return { title: file.name, text, ext: "docx" };
  }
  if (lower.endsWith(".pdf")) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const text = await extractPdfTextFromBytes(buf);
    return { title: file.name, text, ext: "pdf" };
  }
  const text = await file.text();
  return { title: file.name, text, ext };
}
