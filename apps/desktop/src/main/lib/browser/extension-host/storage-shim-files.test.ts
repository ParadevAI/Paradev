import { afterAll, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addStorageShimFiles, STORAGE_SHIM_SCRIPT } from "./storage-shim-files";

const scratch = mkdtempSync(join(tmpdir(), "storage-shim-files-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

test("content scripts and pages load the storage shim first, once, and main-world scripts never", async () => {
	const extension = join(
		scratch,
		"dbepggeogbaibhgnhhndojpepiihcmeb",
		"2.4.2_0",
	);
	mkdirSync(join(extension, "pages"), { recursive: true });
	writeFileSync(
		join(extension, "manifest.json"),
		JSON.stringify({
			manifest_version: 3,
			content_scripts: [
				{ matches: ["<all_urls>"], js: ["lib/settings.js", "content.js"] },
				{ matches: ["<all_urls>"], js: ["page-hook.js"], world: "MAIN" },
				{ matches: ["<all_urls>"], css: ["vimium.css"] },
			],
		}),
	);
	writeFileSync(
		join(extension, "pages", "hud_page.html"),
		'<!DOCTYPE html>\n<html>\n  <head>\n    <script type="module" src="hud_page.js"></script>',
	);

	mkdirSync(join(extension, "views.html"));
	writeFileSync(join(extension, "views.html", "popup.htm"), "<head></head>");

	await addStorageShimFiles(extension);
	await addStorageShimFiles(extension);

	const manifest = JSON.parse(
		readFileSync(join(extension, "manifest.json"), "utf8"),
	);
	expect(
		manifest.content_scripts.map((script: { js?: string[] }) => script.js),
	).toEqual([
		[STORAGE_SHIM_SCRIPT, "lib/settings.js", "content.js"],
		["page-hook.js"],
		undefined,
	]);
	expect(readFileSync(join(extension, "pages", "hud_page.html"), "utf8")).toBe(
		`<!DOCTYPE html>\n<html>\n  <head><script src="/${STORAGE_SHIM_SCRIPT}"></script>\n    <script type="module" src="hud_page.js"></script>`,
	);
	expect(readFileSync(join(extension, "views.html", "popup.htm"), "utf8")).toBe(
		`<head><script src="/${STORAGE_SHIM_SCRIPT}"></script></head>`,
	);
	expect(
		readFileSync(join(extension, STORAGE_SHIM_SCRIPT), "utf8"),
	).toStartWith("(function shimChromeStorage(");
});
