// One-off PWA icon generator: renders the Hypefy mark (dashed aperture ring +
// pulse core, lime on near-black squircle) to PNG at 192/512 + maskable.
// Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const ACCENT = "#a3e635";
const BG = "#0a0a0a";

/**
 * @param {number} size canvas px
 * @param {boolean} maskable maskable icons need ~20% safe-zone padding
 */
function markSvg(size, maskable) {
  // Mark occupies the middle: smaller for maskable so the OS mask never clips it
  const scale = maskable ? 0.52 : 0.68;
  const m = size * scale; // mark box
  const o = (size - m) / 2; // offset
  const r = size * 0.225; // squircle corner radius (ignored for maskable: full bleed)
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : r}" fill="${BG}"/>
  <g transform="translate(${o},${o}) scale(${m / 40})">
    <circle cx="20" cy="20" r="14" stroke="${ACCENT}" stroke-width="2.6"
      stroke-linecap="round" stroke-dasharray="2 4.2" fill="none"/>
    <circle cx="20" cy="20" r="3.2" fill="${ACCENT}"/>
  </g>
</svg>`;
}

mkdirSync("public/icons", { recursive: true });

await sharp(Buffer.from(markSvg(192, false))).png().toFile("public/icons/icon-192.png");
await sharp(Buffer.from(markSvg(512, false))).png().toFile("public/icons/icon-512.png");
await sharp(Buffer.from(markSvg(512, true))).png().toFile("public/icons/icon-maskable-512.png");

console.log("Icons written to public/icons/");
