// Usage: node attrib.mjs <outDir> <label> <mode> [extraQuery]
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const require = createRequire("/tmp/perf/tools/package.json");
const { chromium } = require("playwright-core");
const [outDir, label, mode, extra = ""] = process.argv.slice(2);
const UPDATES = Number(process.env.UPDATES ?? 150);

const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
const server = createServer((req, res) => {
	const path = join(outDir, decodeURIComponent(new URL(req.url, "http://x").pathname));
	if (!existsSync(path) || statSync(path).isDirectory()) return res.writeHead(404).end();
	res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
	createReadStream(path).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));

const browser = await chromium.launch({
	executablePath: "/usr/local/bin/google-chrome",
	args: ["--headless=new", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (error) => console.error("PAGEERROR", String(error)));
await page.goto(`http://127.0.0.1:${server.address().port}/bench.html?mode=${mode}&turns=250&attrib=1${extra}`);
await page.waitForFunction(() => window.__bench?.stats.ready, null, { timeout: 60_000 });
await page.waitForTimeout(1500);
const stats = await page.evaluate((updates) => window.__bench.run(updates, 33), UPDATES);
const attrib = await page.evaluate(() => window.__attrib);
await browser.close();
server.close();

const top = (record, n) =>
	Object.entries(record)
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([name, value]) => [name, Math.round(value * 100) / 100]);
const result = {
	label,
	mode,
	extra,
	updates: stats.updates,
	commits: attrib.commits,
	totalRenders: Object.values(attrib.renders).reduce((a, b) => a + b, 0),
	origins: top(attrib.origins, 15),
	renders: top(attrib.renders, 25),
	selfMs: top(attrib.selfMs, 20),
};
writeFileSync(`/tmp/perf/results/attrib-${label}-${mode}${extra.replace(/[^a-z0-9]/gi, "")}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1));
