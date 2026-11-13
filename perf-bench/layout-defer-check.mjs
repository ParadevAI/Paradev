// Usage: CDP_PORT=<port> node layout-defer-check.mjs
// Checks terminal focus/fit/input and browser-pane placement across real workspace switches.
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
const results = [];
const check = (name, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const open = async (name) => {
	await page.getByText(name, { exact: true }).first().click();
	await page.waitForTimeout(1500);
};
const terminalState = () =>
	page.evaluate(() => {
		const visible = [...document.querySelectorAll(".xterm")].filter((el) => {
			const r = el.getBoundingClientRect();
			return r.width > 50 && r.height > 50;
		});
		const term = visible[0];
		if (!term) return null;
		const host = term.parentElement?.parentElement ?? term.parentElement;
		const screen = term.querySelector(".xterm-screen")?.getBoundingClientRect();
		const box = host.getBoundingClientRect();
		return {
			count: visible.length,
			focused: document.activeElement?.classList.contains("xterm-helper-textarea") ?? false,
			screenW: Math.round(screen?.width ?? 0),
			hostW: Math.round(box.width),
			screenH: Math.round(screen?.height ?? 0),
			hostH: Math.round(box.height),
		};
	});

await page.reload();
await page.getByText("ws-1", { exact: true }).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);

await open("ws-1");
await page.keyboard.press("Control+Shift+T");
await page.waitForTimeout(2000);
let t = await terminalState();
check("new terminal is focused", t?.focused === true, JSON.stringify(t));

await open("ws-2");
await open("ws-1");
await page.waitForTimeout(500);
t = await terminalState();
check("terminal is focused again after switching back", t?.focused === true, JSON.stringify(t));
check(
	"terminal fits its pane after switching back",
	!!t && t.screenW > 0 && t.hostW - t.screenW < 40 && t.hostH - t.screenH < 60,
	t ? `screen ${t.screenW}x${t.screenH} in ${t.hostW}x${t.hostH}` : "no terminal",
);
const marker = `/tmp/perf/defer-terminal-${Date.now()}.txt`;
rmSync(marker, { force: true });
await page.keyboard.type(`echo deferred-ok > ${marker}`, { delay: 15 });
await page.keyboard.press("Enter");
await page.waitForTimeout(2000);
check("terminal takes input right after the switch, without clicking it", existsSync(marker) && readFileSync(marker, "utf8").trim() === "deferred-ok");

await page.keyboard.press("Control+Alt+Shift+B");
await page.waitForTimeout(2500);
await open("ws-2");
await open("ws-1");
await page.waitForTimeout(800);
const placement = await page.evaluate(() => {
	const webviews = [...document.querySelectorAll("webview")].filter((w) => getComputedStyle(w).visibility !== "hidden" && w.style.opacity !== "0" && w.style.pointerEvents !== "none");
	const placeholders = [...document.querySelectorAll("[data-browser-placeholder], [data-pane-kind='browser'] div")];
	const wv = webviews[0];
	if (!wv) return { webviews: 0 };
	const r = wv.getBoundingClientRect();
	const match = [...document.querySelectorAll("div")].find((d) => {
		const b = d.getBoundingClientRect();
		return d !== wv && Math.abs(b.left - r.left) < 2 && Math.abs(b.top - r.top) < 2 && Math.abs(b.width - r.width) < 2 && Math.abs(b.height - r.height) < 2 && !d.contains(wv);
	});
	return { webviews: webviews.length, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], placeholderMatch: !!match, placeholders: placeholders.length };
});
check("browser pane webview sits over its placeholder after switching back", placement.webviews > 0 && placement.placeholderMatch, JSON.stringify(placement));

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
