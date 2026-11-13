// Usage: node profile-report.mjs <file.cpuprofile> [n]
import { readFileSync } from "node:fs";

const [file, nArg = "45"] = process.argv.slice(2);
const n = Number(nArg);
const profile = JSON.parse(readFileSync(file, "utf8"));
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes)
	for (const child of node.children ?? []) parent.set(child, node.id);

const isApp = (url) =>
	url.startsWith("http://localhost:3005/") &&
	!url.includes("/node_modules/") &&
	!url.includes("/.vite/deps/");
const short = (url) =>
	url
		.replace("http://localhost:3005/@fs/workspace/", "")
		.replace("http://localhost:3005/", "apps/desktop/src/renderer/")
		.replace(/\?.*$/, "")
		.replace(/^.*\/routes\/_authenticated\/_dashboard\//, "…/_dashboard/");
const keyOf = (frame) =>
	`${frame.functionName || "(anon)"}  ${short(frame.url)}:${frame.lineNumber + 1}`;

const total = new Map();
const self = new Map();
let sampled = 0;
profile.samples.forEach((id, index) => {
	const ms = (profile.timeDeltas[index] ?? 0) / 1000;
	sampled += ms;
	const leaf = byId.get(id).callFrame;
	if (isApp(leaf.url)) self.set(keyOf(leaf), (self.get(keyOf(leaf)) ?? 0) + ms);
	const seen = new Set();
	for (let current = id; current !== undefined; current = parent.get(current)) {
		const frame = byId.get(current).callFrame;
		if (!isApp(frame.url)) continue;
		const key = keyOf(frame);
		if (seen.has(key)) continue;
		seen.add(key);
		total.set(key, (total.get(key) ?? 0) + ms);
	}
});
const print = (title, map) => {
	console.log(`== ${title}`);
	for (const [key, ms] of [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n))
		console.log(`${ms.toFixed(0).padStart(6)} ms  ${key}`);
};
console.log(`profile span ${(sampled / 1000).toFixed(2)} s`);
print("inclusive time in app code (desktop + workspace packages)", total);
print("self time in app code", self);
