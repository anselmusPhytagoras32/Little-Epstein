import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgbaBuffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowStride = width * 4;
  const scanlines = Buffer.alloc((rowStride + 1) * height);
  for (let y = 0; y < height; y++) {
    scanlines[y * (rowStride + 1)] = 0;
    rgbaBuffer.copy(scanlines, y * (rowStride + 1) + 1, y * rowStride, (y + 1) * rowStride);
  }
  const idatData = zlib.deflateSync(scanlines);
  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idatData),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodePng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IHDR") {
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
    } else if (type === "IDAT") {
      idatChunks.push(buf.subarray(pos + 8, pos + 8 + len));
    }
    pos += 12 + len;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);
  let srcPos = 0;
  let destPos = 0;
  const prevRow = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = decompressed[srcPos++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      let val = decompressed[srcPos++];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;
      if (filter === 0) {}
      else if (filter === 1) val = (val + a) & 0xff;
      else if (filter === 2) val = (val + b) & 0xff;
      else if (filter === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        val = (val + pr) & 0xff;
      }
      row[x] = val;
      pixels[destPos++] = val;
    }
    row.copy(prevRow);
  }
  return { width, height, pixels };
}

const src = decodePng("public/images/Pixel-Art Base Avatar Selection Sheet.png");
const outDir = "public/images/avatars";
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Tight bounding boxes of the 8 characters (avoiding the number tag at the bottom)
const avatars = [
  { id: "explorer", name: "Explorer", x: 63, y: 173, w: 270, h: 355 },
  { id: "survivor", name: "Survivor", x: 370, y: 140, w: 350, h: 388 },
  { id: "fisherman", name: "Fisherman", x: 720, y: 140, w: 360, h: 388 },
  { id: "medic", name: "Medic", x: 1080, y: 181, w: 314, h: 347 },
  { id: "builder", name: "Builder", x: 37, y: 560, w: 323, h: 460 },
  { id: "scout", name: "Scout", x: 360, y: 560, w: 330, h: 460 },
  { id: "chef", name: "Chef", x: 764, y: 560, w: 316, h: 460 },
  { id: "diver", name: "Diver", x: 1080, y: 560, w: 314, h: 460 },
];

for (const a of avatars) {
  const crop = Buffer.alloc(a.w * a.h * 4);
  for (let row = 0; row < a.h; row++) {
    const srcY = a.y + row;
    const srcOffset = (srcY * src.width + a.x) * 4;
    const destOffset = row * a.w * 4;
    src.pixels.copy(crop, destOffset, srcOffset, srcOffset + a.w * 4);
  }
  const png = encodePng(a.w, a.h, crop);
  const outPath = path.join(outDir, `${a.id}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Saved ${outPath} (${a.w}x${a.h})`);
}
