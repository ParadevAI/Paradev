// Usage: node prod-attrib.mjs <trace.json> <distRendererDir> [task-rank] [top-n]
// Maps V8 samples in a production trace back to source via the build's source maps,
// then prints self and inclusive time by original function for one long task.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

const require = createRequire("/tmp/perf/tools/package.json");
const { SourceMapConsumer } = require("source-map-js");
const [traceFile, distDir, rankArg = "0", topArg = "30"] = process.argv.slice(2);
const events = JSON.parse(readFileSync(traceFile, "utf8")).traceEvents;
const main = new Set(
	events
		.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
		.map((e) => `${e.pid}:${e.tid}`),
);
const profile = events.find((e) => e.name === "Profile" && main.has(`${e.pid}:${e.tid}`));
const nodes = new Map();
let t = profile.args.data.startTime;
const timeline = [];
for (const e of events) {
	if (e.name !== "ProfileChunk" || e.id !== profile.id || e.pid !== profile.pid) continue;
	const cpu = e.args.data.cpuProfile ?? {};
	for (const node of cpu.nodes ?? []) nodes.set(node.id, node);
	const deltas = e.args.data.timeDeltas ?? [];
	(cpu.samples ?? []).forEach((id, i) => {
		t += deltas[i] ?? 0;
		timeline.push([t, id]);
	});
}

const consumers = new Map();
const consumerFor = (url) => {
	if (!url.startsWith("file://")) return null;
	if (consumers.has(url)) return consumers.get(url);
	const mapPath = join(distDir, "assets", `${basename(url)}.map`);
	const consumer = existsSync(mapPath)
		? new SourceMapConsumer(JSON.parse(readFileSync(mapPath, "utf8")))
		: null;
	consumers.set(url, consumer);
	return consumer;
};
const resolved = new Map();
const keyOf = (node) => {
	if (resolved.has(node.id)) return resolved.get(node.id);
	const frame = node.callFrame;
	let key = `${frame.functionName || "(anon)"} ${frame.url ? basename(frame.url) : ""}`;
	const consumer = frame.url ? consumerFor(frame.url) : null;
	if (consumer) {
		const pos = consumer.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
		if (pos.source) {
			const source = pos.source
				.replace(/^.*node_modules\/\.bun\/([^/]+)\/node_modules\//, "npm:")
				.replace(/^.*\/apps\/desktop\/src\/renderer\//, "renderer/")
				.replace(/^.*\/packages\//, "packages/")
				.replace(/^renderer\/routes\/_authenticated\/_dashboard\//, "…/");
			key = `${pos.name || frame.functionName || "(anon)"}  ${source}:${pos.line}`;
		}
	}
	resolved.set(node.id, key);
	return key;
};
const parentOf = new Map();
for (const node of nodes.values()) {
	if (node.parent !== undefined) parentOf.set(node.id, node.parent);
	for (const child of node.children ?? []) parentOf.set(child, node.id);
}

const tasks = events
	.filter((e) => e.name === "RunTask" && main.has(`${e.pid}:${e.tid}`) && e.dur)
	.sort((a, b) => b.dur - a.dur);
const task = tasks[Number(rankArg)];
const interval = timeline.length > 1 ? (timeline[timeline.length - 1][0] - timeline[0][0]) / timeline.length / 1000 : 0.1;
const self = new Map();
const total = new Map();
for (const [ts, id] of timeline) {
	if (ts < task.ts || ts > task.ts + task.dur) continue;
	const leaf = nodes.get(id);
	const leafKey = keyOf(leaf);
	self.set(leafKey, (self.get(leafKey) ?? 0) + interval);
	const seen = new Set();
	for (let current = id; current !== undefined; current = parentOf.get(current)) {
		const key = keyOf(nodes.get(current));
		if (seen.has(key)) continue;
		seen.add(key);
		total.set(key, (total.get(key) ?? 0) + interval);
	}
}
const top = (map, filter = () => true) =>
	[...map.entries()]
		.filter(([key]) => filter(key))
		.sort((a, b) => b[1] - a[1])
		.slice(0, Number(topArg))
		.map(([key, ms]) => `${ms.toFixed(1).padStart(7)} ms  ${key}`)
		.join("\n");
console.log(`task ${(task.dur / 1000).toFixed(0)} ms`);
console.log("== self");
console.log(top(self));
console.log("== inclusive, app code");
console.log(top(total, (key) => /renderer\/|…\/|packages\//.test(key)));

const phases = [
	"performWorkOnRoot", "renderRootSync", "workLoopSync", "commitRoot", "commitRootImpl", "flushLayoutEffects", "flushMutationEffects",
	"commitMutationEffects", "commitLayoutEffects", "flushPassiveEffects", "flushSpawnedWork", "recursivelyAccumulateSuspenseyCommit",
	"recursivelyTraverseLayoutEffects", "recursivelyTraverseReappearLayoutEffects", "recursivelyTraverseDisappearLayoutEffects",
	"commitPassiveMountOnFiber", "commitPassiveUnmountOnFiber", "recursivelyTraverseReconnectPassiveEffects", "recursivelyTraverseDisconnectPassiveEffects",
	"dispatchDiscreteEvent", "useSyncExternalStore", "subscribeToStore", "forceStoreRerender", "updateStoreInstance",
];
console.log("== inclusive, React phases");
console.log(
	[...total.entries()]
		.filter(([key]) => phases.some((phase) => key.startsWith(`${phase} `)))
		.sort((a, b) => b[1] - a[1])
		.map(([key, ms]) => `${ms.toFixed(1).padStart(7)} ms  ${key.split("  ")[0]}`)
		.join("\n"),
);

const natives = ["focus", "scrollIntoView", "setAttribute", "getBoundingClientRect", "(program)", "get cssText", "updateStateInner"];
const callers = new Map();
for (const [ts, id] of timeline) {
	if (ts < task.ts || ts > task.ts + task.dur) continue;
	const leafName = keyOf(nodes.get(id)).split(" ")[0];
	if (!natives.includes(leafName) && !keyOf(nodes.get(id)).startsWith("updateStateInner")) continue;
	let caller = "(none)";
	let hops = 0;
	for (let current = parentOf.get(id); current !== undefined && hops < 40; current = parentOf.get(current), hops++) {
		const key = keyOf(nodes.get(current));
		if (/renderer\/|…\/|packages\/|npm:(@radix-ui|@tiptap|prosemirror|@xterm|react-remove-scroll|@floating-ui|cmdk)/.test(key) && !/react-dom/.test(key)) {
			caller = key;
			break;
		}
	}
	const k = `${leafName}  <-  ${caller}`;
	callers.set(k, (callers.get(k) ?? 0) + interval);
}
console.log("== native work by first app/library caller");
console.log(
	[...callers.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 25)
		.map(([k, ms]) => `${ms.toFixed(1).padStart(7)} ms  ${k}`)
		.join("\n"),
);
