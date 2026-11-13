// Usage: CDP_PORT=<port> node keepalive-check.mjs
// Functional checks for kept workspaces, driven with real input in the running app.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/perf/tools/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT}`);
const page = browser
	.contexts()
	.flatMap((context) => context.pages())
	.find((candidate) => /renderer\/index\.html|localhost:3005/.test(candidate.url()));
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
	if (message.type() === "error") errors.push(message.text().slice(0, 200));
});

const results = [];
const check = (name, ok, detail) => {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const open = async (name) => {
	await page.getByText(name, { exact: true }).first().click();
	await page.waitForTimeout(1200);
};
const state = () =>
	page.evaluate(() => {
		const urlId = location.hash.match(/v2-workspace\/([^/?]+)/)?.[1] ?? null;
		const areas = [...document.querySelectorAll('[data-pane-area="center"][data-workspace-id]')];
		const visible = areas.filter((area) => !area.closest("[data-hidden-workspace]"));
		const hiddenWrappers = [...document.querySelectorAll("[data-hidden-workspace]")];
		const titleBars = [...document.querySelectorAll('[data-pane-area="center"]:not([data-workspace-id])')];
		const xtermIn = (root) => root.querySelectorAll(".xterm").length;
		return {
			urlId,
			visibleIds: visible.map((area) => area.getAttribute("data-workspace-id")),
			hiddenCount: hiddenWrappers.length,
			hiddenAllInert: hiddenWrappers.every((wrapper) => wrapper.hasAttribute("inert")),
			hiddenAllNotDisplayed: hiddenWrappers.every((wrapper) => getComputedStyle(wrapper).display === "none"),
			interactiveTitleBars: titleBars.filter((bar) => !bar.hasAttribute("inert") && !bar.closest("[inert]")).length,
			visibleXterms: visible[0] ? xtermIn(visible[0]) : 0,
			hiddenXterms: hiddenWrappers.map(xtermIn),
		};
	});

await page.reload();
await page.getByText("ws-1", { exact: true }).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
for (const name of ["ws-1", "ws-2", "ws-3"]) await open(name);

await open("ws-1");
let s = await state();
check("only the open workspace is visible", s.visibleIds.length === 1 && s.visibleIds[0] === s.urlId, JSON.stringify(s.visibleIds));
check("kept workspaces are hidden, inert and not displayed", s.hiddenCount === 2 && s.hiddenAllInert && s.hiddenAllNotDisplayed, `hidden=${s.hiddenCount}`);
check("one interactive center tab bar in the title bar", s.interactiveTitleBars === 1, `count=${s.interactiveTitleBars}`);

const marker = `/tmp/perf/kept-terminal-${Date.now()}.txt`;
rmSync(marker, { force: true });
const xterm = page.locator('[data-workspace-id] .xterm').filter({ visible: true }).first();
await xterm.click();
await page.keyboard.type(`echo kept-ok > ${marker}`, { delay: 15 });
await page.keyboard.press("Enter");
await page.waitForTimeout(2000);
check(
	"a revealed workspace's terminal runs commands",
	existsSync(marker) && readFileSync(marker, "utf8").trim() === "kept-ok",
	existsSync(marker) ? "marker written" : "no marker",
);

s = await state();
const before = { visible: s.visibleXterms, hidden: s.hiddenXterms };
await page.keyboard.press("Control+Shift+T");
await page.waitForTimeout(2000);
s = await state();
check(
	"new-terminal shortcut acts on the visible workspace only",
	s.visibleXterms === before.visible + 1 && JSON.stringify(s.hiddenXterms) === JSON.stringify(before.hidden),
	`visible ${before.visible}->${s.visibleXterms}, hidden ${JSON.stringify(before.hidden)}->${JSON.stringify(s.hiddenXterms)}`,
);

await open("ws-2");
const ws2 = (await state()).urlId;
await page.goBack();
await page.waitForTimeout(1500);
s = await state();
check("back navigation shows the previous workspace", s.urlId !== ws2 && s.visibleIds[0] === s.urlId, `${ws2?.slice(0, 8)} -> ${s.urlId?.slice(0, 8)}`);

const appErrors = errors.filter((text) => !/origin' does not appear|Failed to load resource|ERR_/.test(text));
check("no page errors during the checks", appErrors.length === 0, appErrors.slice(0, 2).join(" | "));
await browser.close();
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
