// One-off: renders the default 1200x630 OpenGraph card (Hypefy mark + wordmark
// + tagline, lime on near-black) used for link unfurls with no better image.
// Run: node scripts/gen-og-image.mjs
import sharp from "sharp";

const ACCENT = "#a3e635";
const BG = "#0a0a0a";

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${BG}"/>
  <g transform="translate(510,120) scale(4.5)">
    <circle cx="20" cy="20" r="14" stroke="${ACCENT}" stroke-width="2.6"
      stroke-linecap="round" stroke-dasharray="2 4.2" fill="none"/>
    <circle cx="20" cy="20" r="3.2" fill="${ACCENT}"/>
  </g>
  <text x="600" y="430" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
    font-size="88" font-weight="800" fill="#ffffff">Hypefy<tspan fill="${ACCENT}">.</tspan></text>
  <text x="600" y="500" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
    font-size="34" font-weight="500" fill="#9b9b9b">Where your personality lives.</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("public/og-default.png");
console.log("Wrote public/og-default.png");
