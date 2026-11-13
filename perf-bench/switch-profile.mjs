// Usage: node switch-profile.mjs <label> <target-workspace-name>
// CPU-profiles one real sidebar click and prints the hottest functions.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/perf/tools/package.json");
const { chromium } = require("playwright-core");
const [label = "profile", target = "ws-2"] = process.argv.slice(2);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT ?? 19322}`);
const page = browser
	.contexts()
	.flatMap((context) => context.pages())
	.find((candidate) => (candidate.url().startsWith("http://localhost:3005") || /^file:.*\/renderer\/index\.html/.test(candidate.url())));
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
const row = page.getByText(target, { exact: true }).first();
await row.waitFor();
await cdp.send("Profiler.start");
await row.click();
await page.waitForTimeout(4500);
const { profile } = await cdp.send("Profiler.stop");
await browser.close();
writeFileSync(`/tmp/perf/profile-${label}.cpuprofile`, JSON.stringify(profile));

const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes)
	for (const child of node.children ?? []) parent.set(child, node.id);
const dt = profile.timeDeltas;
const selfMs = new Map();
const totalMs = new Map();
const keyOf = (node) => {
	const frame = node.callFrame;
	const url = frame.url.replace(/^.*\/(node_modules\/\.bun\/[^/]+|src)\//, "$1/").replace(/\?.*$/, "");
	return `${frame.functionName || "(anon)"} ${url}:${frame.lineNumber + 1}`;
};
profile.samples.forEach((id, index) => {
	const ms = (dt[index] ?? 0) / 1000;
	const node = byId.get(id);
	const key = keyOf(node);
	selfMs.set(key, (selfMs.get(key) ?? 0) + ms);
	const seen = new Set();
	for (let current = id; current !== undefined; current = parent.get(current)) {
		const k = keyOf(byId.get(current));
		if (seen.has(k)) continue;
		seen.add(k);
		totalMs.set(k, (totalMs.get(k) ?? 0) + ms);
	}
});
const top = (map, n, filter = () => true) =>
	[...map.entries()]
		.filter(([key]) => filter(key))
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([key, ms]) => `${ms.toFixed(0).padStart(6)} ms  ${key}`);
console.log("== self time");
console.log(top(selfMs, 25).join("\n"));
console.log("== total time, app code (src/)");
console.log(top(totalMs, 40, (key) => / src\//.test(key)).join("\n"));
