// Renders web/public/icon.svg into the PNG sizes iOS and Android want.
// Usage: node scripts/make-icons.mjs   (needs Playwright + Chromium)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../web/public/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, name, bleed] of [
  [180, "apple-touch-icon.png", true],
  [192, "icon-192.png", false],
  [512, "icon-512.png", false],
]) {
  await page.setViewportSize({ width: size, height: size });
  // iOS rounds the corners itself, so the touch icon is full-bleed (no transparent corners).
  const body = bleed ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<html><body style="margin:0;background:transparent">${body.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../web/public/${name}`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
console.log("icons written");
