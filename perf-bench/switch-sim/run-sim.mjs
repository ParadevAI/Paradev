// Usage: node run-sim.mjs <outDir> <label> [repeats]
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
const require = createRequire("/tmp/perf-mac/tools/package.json");
const { chromium } = require("playwright-core");
const [outDir, label, repeatsArg = "3"] = process.argv.slice(2);
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
	const path = join(outDir, decodeURIComponent(new URL(req.url, "http://x").pathname));
	if (!existsSync(path) || statSync(path).isDirectory()) return res.writeHead(404).end();
	res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
	createReadStream(path).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const out = [];
for (let i = 0; i < Number(repeatsArg); i++) {
	const browser = await chromium.launch({ executablePath: CHROME, args: ["--headless=new"] });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = [];
	page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
	await page.goto(`http://127.0.0.1:${server.address().port}/switch.html`);
	await page.waitForFunction(() => window.__sim, null, { timeout: 30000 });
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Performance.enable");
	const busy = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])).TaskDuration * 1000;
	await page.evaluate(() => window.__sim.richInput(5));
	const before = await busy();
	await page.evaluate(() => window.__sim.richInput(30));
	const rich = [((await busy()) - before) / 30];
	const state = await page.evaluate(() => window.__sim.dataState(20));
	await browser.close();
	out.push({ richMedian: median(rich), stateMedian: median(state), errors });
	process.stderr.write(`${label} run ${i}: richInput mount ${median(rich).toFixed(1)} ms, 40 data-state flips ${median(state).toFixed(1)} ms, errors ${errors.length}\n`);
}
server.close();
writeFileSync(`/tmp/perf-mac/sim-${label}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ label, richInputMountMs: median(out.map((o) => o.richMedian)), dataStateFlipsMs: median(out.map((o) => o.stateMedian)), errors: out.flatMap((o) => o.errors).slice(0, 3) }));
