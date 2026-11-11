import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, "..");
const outDir = path.resolve(extRoot, "..", "dist-artifacts");
const outZip = path.join(outDir, "piizero-chrome-extension.zip");

fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function collectFiles(baseDir, relPrefix = "") {
  const results = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const full = path.join(baseDir, entry.name);
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, rel));
    } else if (entry.isFile()) {
      results.push({ full, rel });
    }
  }
  return results;
}

const filesToInclude = [
  { full: path.join(extRoot, "manifest.json"), rel: "manifest.json" },
  ...collectFiles(path.join(extRoot, "dist"), "dist"),
  ...collectFiles(path.join(extRoot, "icons"), "icons"),
  ...collectFiles(path.join(extRoot, "src"), "src")
];

const localHeaders = [];
const centralHeaders = [];
let offset = 0;

for (const file of filesToInclude) {
  const rawData = fs.readFileSync(file.full);
  const compressed = zlib.deflateRawSync(rawData, { level: 9 });
  const nameBuf = Buffer.from(file.rel.replace(/\\/g, "/"), "utf8");
  const crc = crc32(rawData);

  const localHeader = Buffer.alloc(30 + nameBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6);  // flags
  localHeader.writeUInt16LE(8, 8);  // deflate
  localHeader.writeUInt16LE(0, 10); // mod time
  localHeader.writeUInt16LE(0x576b, 12); // mod date
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(rawData.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);
  nameBuf.copy(localHeader, 30);

  const centralHeader = Buffer.alloc(46 + nameBuf.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0x576b, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(rawData.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(offset, 42);
  nameBuf.copy(centralHeader, 46);

  localHeaders.push(localHeader, compressed);
  centralHeaders.push(centralHeader);
  offset += localHeader.length + compressed.length;
}

const centralSize = centralHeaders.reduce((acc, b) => acc + b.length, 0);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(filesToInclude.length, 8);
eocd.writeUInt16LE(filesToInclude.length, 10);
eocd.writeUInt32LE(centralSize, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

const zipBuffer = Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
fs.writeFileSync(outZip, zipBuffer);
console.log(`Packaged ${filesToInclude.length} files into ${outZip} (${zipBuffer.length} bytes)`);
