// Usage: node switch-bench.mjs <label> [cycles]
// Measures workspace switches in the running dev desktop over CDP (port 19322).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/perf/tools/package.json");
const { chromium } = require("playwright-core");
const [label = "run", cyclesArg = "4"] = process.argv.slice(2);
const cycles = Number(cyclesArg);
const WORKSPACES = ["ws-1", "ws-2", "ws-3", "ws-4"];
const WINDOW_MS = 6000;

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT ?? 19322}`);
const page = browser
	.contexts()
	.flatMap((context) => context.pages())
	.find((candidate) => (candidate.url().startsWith("http://localhost:3005") || /^file:.*\/renderer\/index\.html/.test(candidate.url())));
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
if (process.env.NO_RELOAD !== "1") {
	await page.reload();
	await page.getByText("ws-1", { exact: true }).first().waitFor({ timeout: 60000 });
	await page.waitForTimeout(3000);
}
if (process.env.DROP_BODY_HAS === "1") {
	const dropped = await page.evaluate(() => {
		let count = 0;
		for (const sheet of document.styleSheets) {
			const walk = (rules, owner) => {
				for (let i = rules.length - 1; i >= 0; i--) {
					const rule = rules[i];
					if (rule.cssRules && !rule.selectorText) walk(rule.cssRules, rule);
					else if (rule.selectorText?.includes("body:has(")) {
						owner.deleteRule(i);
						count++;
					}
				}
			};
			try { walk(sheet.cssRules, sheet); } catch {}
		}
		return count;
	});
	process.stderr.write(`dropped ${dropped} body:has rule(s)\n`);
}

await page.evaluate(() => {
	if (window.__switchBench) return;
	const state = { longTasks: [], loafs: [] };
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries())
			state.longTasks.push({ start: entry.startTime, duration: entry.duration });
	}).observe({ type: "longtask" });
	try {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries())
				state.loafs.push({
					start: entry.startTime,
					duration: entry.duration,
					blocking: entry.blockingDuration,
					posthogMs: (entry.scripts ?? [])
						.filter((script) => /posthog/i.test(script.sourceURL ?? ""))
						.reduce((sum, script) => sum + script.duration, 0),
				});
		}).observe({ type: "long-animation-frame" });
	} catch {}
	document.addEventListener(
		"click",
		(event) => {
			state.lastClick = event.timeStamp;
			state.urlAt = null;
			state.paintAt = null;
		},
		true,
	);
	const onUrl = () => {
		if (state.urlAt !== null) return;
		state.urlAt = performance.now();
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				state.paintAt = performance.now();
			}),
		);
	};
	for (const method of ["pushState", "replaceState"]) {
		const original = history[method].bind(history);
		history[method] = (...args) => {
			const result = original(...args);
			onUrl();
			return result;
		};
	}
	window.addEventListener("hashchange", onUrl);
	window.__switchBench = state;
});

async function switchTo(name) {
	const row = page.getByText(name, { exact: true }).first();
	await row.waitFor();
	const before = Object.fromEntries(
		(await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
	);
	const fromHash = await page.evaluate(() => location.hash);
	await row.click();
	const timings = await page.evaluate(
		async ({ fromHash, windowMs }) => {
			const state = window.__switchBench;
			const t0 = state.lastClick;
			const deadline = t0 + windowMs;
			await new Promise((resolve) => {
				const tick = () => {
					if (performance.now() > deadline) resolve();
					else setTimeout(tick, 100);
				};
				tick();
			});
			const route = state.urlAt === null ? null : state.urlAt - t0;
			const paint = state.paintAt === null ? null : state.paintAt - t0;
			const inWindow = (entry) => entry.start >= t0 && entry.start <= t0 + windowMs;
			const longTasks = state.longTasks.filter(inWindow);
			const loafs = state.loafs.filter(inWindow);
			const requests = performance
				.getEntriesByType("resource")
				.filter(
					(entry) =>
						entry.startTime >= t0 &&
						entry.startTime <= t0 + windowMs &&
						/127\.0\.0\.1:\d+\/trpc|localhost:\d+\/trpc|\/api\/trpc/.test(entry.name),
				);
			const busyEnds = [...longTasks.map((e) => e.start + e.duration)];
			return {
				routeMs: route,
				paintMs: paint,
				settledMs: busyEnds.length ? Math.max(...busyEnds) - t0 : paint,
				longTasks: longTasks.length,
				longTaskMs: longTasks.reduce((sum, entry) => sum + entry.duration, 0),
				maxLongTaskMs: Math.max(0, ...longTasks.map((entry) => entry.duration)),
				loafBlockingMs: loafs.reduce((sum, entry) => sum + entry.blocking, 0),
				posthogMs: loafs.reduce((sum, entry) => sum + (entry.posthogMs ?? 0), 0),
				trpcRequests: requests.length,
			};
		},
		{ fromHash, windowMs: WINDOW_MS },
	);
	const after = Object.fromEntries(
		(await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
	);
	return {
		name,
		...timings,
		scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
		taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
		layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
	};
}

await page.evaluate(() => performance.clearResourceTimings());
await page.evaluate(() => performance.setResourceTimingBufferSize(5000));
const results = [];
for (const name of WORKSPACES) {
	await switchTo(name);
	await page.waitForTimeout(1500);
}
for (let cycle = 0; cycle < cycles; cycle++) {
	for (const name of WORKSPACES) {
		const result = await switchTo(name);
		results.push({ cycle, ...result });
		process.stderr.write(
			`${label} ${name}: route=${result.routeMs?.toFixed(0)} paint=${result.paintMs?.toFixed(0)} settled=${result.settledMs?.toFixed(0)}ms longTask=${result.longTaskMs.toFixed(0)}ms trpc=${result.trpcRequests}\n`,
		);
		await page.waitForTimeout(500);
	}
}
await browser.close();

const median = (values) => {
	const sorted = values.filter((v) => v !== null).sort((a, b) => a - b);
	return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const p90 = (values) => {
	const sorted = values.filter((v) => v !== null).sort((a, b) => a - b);
	return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : null;
};
const keys = ["routeMs", "paintMs", "settledMs", "longTasks", "longTaskMs", "maxLongTaskMs", "loafBlockingMs", "posthogMs", "trpcRequests", "scriptMs", "taskMs", "layoutMs"];
const summary = Object.fromEntries(
	keys.map((key) => [key, { median: median(results.map((r) => r[key])), p90: p90(results.map((r) => r[key])) }]),
);
summary.n = results.length;
summary.noPaint = results.filter((r) => r.paintMs === null).length;
writeFileSync(`/tmp/perf/switch-${label}.json`, JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1));
