// Usage: CDP_PORT=<port> node switch-mutations.mjs <target-workspace-name>
// Records attribute mutations during one real sidebar click, grouped by element and attribute.
import { createRequire } from "node:module";

const require = createRequire("/tmp/perf/tools/package.json");
const { chromium } = require("playwright-core");
const [target = "ws-2"] = process.argv.slice(2);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT}`);
const page = browser
	.contexts()
	.flatMap((context) => context.pages())
	.find((candidate) => /renderer\/index\.html|localhost:3005/.test(candidate.url()));
await page.evaluate(() => {
	const describe = (node) => {
		let depth = 0;
		for (let current = node; current?.parentElement; current = current.parentElement) depth++;
		const id = node.id ? `#${node.id}` : "";
		const slot = node.getAttribute?.("data-slot") ? `[data-slot=${node.getAttribute("data-slot")}]` : "";
		const area = node.getAttribute?.("data-pane-area") ? `[data-pane-area=${node.getAttribute("data-pane-area")}]` : "";
		return `${node.tagName?.toLowerCase()}${id}${slot}${area} depth=${depth}`;
	};
	window.__mutations = new Map();
	window.__mutationObserver = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type !== "attributes") continue;
			const key = `${describe(record.target)} @${record.attributeName}`;
			window.__mutations.set(key, (window.__mutations.get(key) ?? 0) + 1);
		}
	});
	window.__mutationObserver.observe(document.documentElement, { attributes: true, subtree: true });
});
await page.getByText(target, { exact: true }).first().click();
await page.waitForTimeout(1500);
const result = await page.evaluate(() => {
	window.__mutationObserver.disconnect();
	return [...window.__mutations.entries()].sort((a, b) => b[1] - a[1]);
});
await browser.close();
const shallow = result.filter(([key]) => Number(key.match(/depth=(\d+)/)?.[1] ?? 99) <= 6);
console.log(`attribute mutations: ${result.reduce((sum, [, count]) => sum + count, 0)} across ${result.length} element/attribute pairs`);
console.log("== shallowest (depth <= 6), these invalidate large subtrees");
for (const [key, count] of shallow.slice(0, 25)) console.log(`${String(count).padStart(5)}  ${key}`);
console.log("== most frequent");
for (const [key, count] of result.slice(0, 25)) console.log(`${String(count).padStart(5)}  ${key}`);
