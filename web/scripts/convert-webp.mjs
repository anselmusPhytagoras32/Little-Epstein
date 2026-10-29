import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const imgDir = path.resolve(import.meta.dirname, "../public/images");
const files = fs.readdirSync(imgDir).filter(f => f.endsWith(".png"));

console.log(`Converting PNG assets in ${imgDir} to WebP...`);

for (const f of files) {
  const inputPath = path.join(imgDir, f);
  const outName = f.replace(/\.png$/, ".webp");
  const outPath = path.join(imgDir, outName);
  const isPixel = f.includes("Pixel") || f.includes("Sprite");

  const opts = isPixel
    ? { quality: 92, nearLossless: true, effort: 4 }
    : { quality: 90, effort: 4 };

  await sharp(inputPath).webp(opts).toFile(outPath);
  const origSize = fs.statSync(inputPath).size;
  const outSize = fs.statSync(outPath).size;
  const ratio = ((1 - outSize / origSize) * 100).toFixed(1);
  console.log(`  ✓ ${outName}: ${(outSize / 1024).toFixed(1)} KB (-${ratio}%)`);
}

console.log("All assets converted successfully.");

