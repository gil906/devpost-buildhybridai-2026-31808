import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, "..", "icons");
fs.mkdirSync(iconsDir, { recursive: true });

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

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function renderIconPng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const center = (size - 1) / 2;
  const outerR = size * 0.38;
  const innerR = size * 0.22;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      // Default canvas #111c26
      let r = 0x11, g = 0x1c, b = 0x26, a = 255;

      // Ruled border #263849
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        r = 0x26; g = 0x38; b = 0x49;
      } else {
        const dx = x - center;
        const dy = y - center;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Hexagonal / ring airlock shield in #8dd6c7
        if (dist <= outerR && dist >= innerR) {
          r = 0x8d; g = 0xd6; b = 0xc7;
        } else if (dist < innerR * 0.52) {
          // Center vault core in #f2cb85
          r = 0xf2; g = 0xcb; b = 0x85;
        }
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

for (const size of [16, 48, 128]) {
  const out = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(out, renderIconPng(size));
  console.log(`Generated ${out}`);
}
