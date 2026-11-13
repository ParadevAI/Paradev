// Usage: node switch-trace.mjs <label> <target-workspace-name>
// Chrome-traces one real sidebar click and breaks the main thread down by event type.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/perf/tools/package.json");
const { chromium } = require("playwright-core");
const [label = "trace", target = "ws-2"] = process.argv.slice(2);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT ?? 19322}`);
const page = browser
	.contexts()
	.flatMap((context) => context.pages())
	.find((candidate) => (candidate.url().startsWith("http://localhost:3005") || /^file:.*\/renderer\/index\.html/.test(candidate.url())));
const cdp = await page.context().newCDPSession(page);
const events = [];
cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
const done = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
const row = page.getByText(target, { exact: true }).first();
await row.waitFor();
await cdp.send("Tracing.start", {
	categories: "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,toplevel",
	transferMode: "ReportEvents",
});
await row.click();
await page.waitForTimeout(4500);
await cdp.send("Tracing.end");
await done;
await browser.close();
writeFileSync(`/tmp/perf/trace-${label}.json`, JSON.stringify({ traceEvents: events }));

const mainPid = (() => {
	const counts = new Map();
	for (const event of events)
		if (event.name === "RunTask") counts.set(`${event.pid}:${event.tid}`, (counts.get(`${event.pid}:${event.tid}`) ?? 0) + (event.dur ?? 0));
	const names = events.filter((event) => event.name === "thread_name" && event.args?.name === "CrRendererMain");
	return names.map((event) => `${event.pid}:${event.tid}`);
})();
const onMain = (event) => mainPid.includes(`${event.pid}:${event.tid}`);
const tasks = events.filter((event) => onMain(event) && event.name === "RunTask" && event.dur);
const long = tasks.filter((event) => event.dur > 50_000).sort((a, b) => b.dur - a.dur);
console.log(`main threads: ${mainPid.join(", ")}; tasks>50ms: ${long.length}`);
const types = ["FunctionCall", "EvaluateScript", "v8.compile", "V8.GC_MARK_COMPACTOR", "MinorGC", "MajorGC", "UpdateLayoutTree", "Layout", "Paint", "PrePaint", "Layerize", "HitTest", "ParseHTML", "TimerFire", "FireAnimationFrame", "EventDispatch", "v8.run"];
for (const task of long.slice(0, 4)) {
	const inside = events.filter(
		(event) => onMain(event) && event.ts >= task.ts && event.ts + (event.dur ?? 0) <= task.ts + task.dur && event.dur,
	);
	const byName = new Map();
	for (const event of inside) if (types.includes(event.name)) byName.set(event.name, (byName.get(event.name) ?? 0) + event.dur / 1000);
	const fn = inside.filter((event) => event.name === "FunctionCall").sort((a, b) => b.dur - a.dur)[0];
	console.log(
		`task ${(task.dur / 1000).toFixed(0)} ms:`,
		[...byName.entries()].sort((a, b) => b[1] - a[1]).map(([name, ms]) => `${name}=${ms.toFixed(0)}`).join(" "),
		fn ? `| top FunctionCall ${(fn.dur / 1000).toFixed(0)}ms ${fn.args?.data?.functionName ?? ""} ${(fn.args?.data?.url ?? "").replace(/^.*localhost:3005\//, "").slice(0, 120)}:${fn.args?.data?.lineNumber ?? ""}` : "",
	);
}
