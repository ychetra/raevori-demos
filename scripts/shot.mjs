// Screenshot a page for design review: node scripts/shot.mjs <url> <out.png> [width] [height] [fullPage]
import { chromium } from "@playwright/test";

const [url, out, w = "390", h = "844", full = "1"] = process.argv.slice(2);
const executablePath = process.env.CHROMIUM_PATH ?? "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome";
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: full === "1" });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(out, overflow > 0 ? `HORIZONTAL OVERFLOW ${overflow}px` : "no overflow");
await browser.close();
