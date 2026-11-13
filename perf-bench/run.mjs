// Usage: node run.mjs <outDir> <label> <mode> [repeats] [extraQuery]
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/tmp/perf/tools/package.json");
const { chromium } = require("playwright-core");

const [outDir, label, mode, repeatsArg = "3", extra = ""] = process.argv.slice(2);
const repeats = Number(repeatsArg);
const UPDATES = Number(process.env.UPDATES ?? 300);
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 33);
const TURNS = Number(process.env.TURNS ?? 250);
const TRACE = process.env.TRACE === "1";

const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
	const path = join(outDir, decodeURIComponent(new URL(req.url, "http://x").pathname));
	if (!existsSync(path) || statSync(path).isDirectory()) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
	createReadStream(path).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const pct = (values, p) => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const sum = (values) => values.reduce((a, b) => a + b, 0);

const results = [];
for (let i = 0; i < repeats; i++) {
	const browser = await chromium.launch({
		executablePath: "/usr/local/bin/google-chrome",
		args: ["--headless=new", "--no-sandbox", "--enable-blink-features=LongAnimationFrameTiming"],
	});
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = [];
	page.on("pageerror", (error) => errors.push(String(error)));
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Performance.enable");
	if (process.env.THROTTLE) await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) });
	const loadStart = Date.now();
	await page.goto(`http://127.0.0.1:${port}/bench.html?mode=${mode}&turns=${TURNS}${extra}`);
	await page.waitForFunction(() => window.__bench?.stats.ready, null, { timeout: 60_000 }).catch(() => {});
	const loadMs = Date.now() - loadStart;
	await page.waitForTimeout(1500);
	const metric = async () =>
		Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
	const before = await metric();
	if (TRACE && i === 0) {
		await browser.startTracing(page, {
			path: `/tmp/perf/trace-${label}-${mode}.json`,
			categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "blink.user_timing"],
		});
	}
	const stats = await page.evaluate(
		([updates, interval]) => window.__bench.run(updates, interval),
		[UPDATES, INTERVAL_MS],
	);
	if (TRACE && i === 0) await browser.stopTracing();
	const after = await metric();
	const rowsInDom = await page.evaluate(() => document.querySelectorAll("[data-message-id], [data-slot='message-scroller-item']").length);
	await browser.close();
	const wallS = sum(stats.frameGaps) / 1000 || 1;
	results.push({
		label,
		mode,
		run: i,
		loadMs,
		items: stats.items,
		rowsInDom,
		updates: stats.updates,
		commits: stats.commits,
		commitsPerUpdate: stats.commits / Math.max(1, stats.updates),
		renderTotalMs: sum(stats.renderMs),
		renderMeanMs: sum(stats.renderMs) / Math.max(1, stats.renderMs.length),
		renderP50Ms: pct(stats.renderMs, 50),
		renderP95Ms: pct(stats.renderMs, 95),
		renderMaxMs: Math.max(0, ...stats.renderMs),
		longTasks: stats.longTasks.length,
		longTaskMs: sum(stats.longTasks),
		loafs: stats.loafs.length,
		loafBlockingMs: sum(stats.loafs.map((l) => l.blocking)),
		framesOver33: stats.frameGaps.filter((g) => g > 33.4).length,
		frameP95Ms: pct(stats.frameGaps, 95),
		scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
		taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
		layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
		styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
		wallS,
		errors: errors.slice(0, 3),
	});
	process.stderr.write(`${label} ${mode} run ${i}: commits=${stats.commits} render=${sum(stats.renderMs).toFixed(0)}ms items=${stats.items} errors=${errors.length}\n`);
}
server.close();
const file = `/tmp/perf/results/${label}-${mode}${extra.replace(/[^a-z0-9]/gi, "")}-${process.env.THROTTLE ? `t${process.env.THROTTLE}` : ""}-${process.env.RUN_TAG ?? "x"}.json`;
writeFileSync(file, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ errors, ...r }) => r)));
if (results.some((r) => r.errors.length)) console.error("ERRORS", results[0].errors);
