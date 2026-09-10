/**
 * Renders the icon set from the two masters in `public/`: `pizzometro.svg`
 * is the bare mark, `pizzometro_app.svg` the same mark on its dark tile.
 * Run with `npm run icons` after changing either. PNG matters here: iOS
 * ignores SVG touch icons — and the masters stay out of `src/app`, where
 * Next would turn them into icon routes of their own.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

/** The bare mark, for the browser tab. */
const MARK = "public/pizzometro.svg";
/** The same mark on its dark tile: everything an installed app shows. */
const APP = "public/pizzometro_app.svg";

const targets = [
  { src: APP, out: "public/icon-192.png", size: 192 },
  { src: APP, out: "public/icon-512.png", size: 512 },
  { src: "public/icon-maskable.svg", out: "public/icon-maskable-512.png", size: 512 },
  { src: APP, out: "src/app/apple-icon.png", size: 180 },
];

await mkdir("public", { recursive: true });
for (const { src, out, size } of targets) {
  const svg = await readFile(src);
  const png = await sharp(svg, { density: 512 }).resize(size, size).png().toBuffer();
  await writeFile(out, png);
  console.log(`${out}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`);
}

// The tab icon is the bare mark — no tile, so it sits on whatever the
// browser's chrome happens to be. Copied rather than hand-maintained.
await copyFile(MARK, "src/app/icon.svg");
console.log("src/app/icon.svg  (copied from the mark master)");
