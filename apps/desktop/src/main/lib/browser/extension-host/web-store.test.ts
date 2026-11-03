import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { downloadExtensionFromURL } from "electron-chrome-web-store";
import { enableCrxVerification } from "./web-store";

const JSON_FORMATTER_ID = "bcjindcccaagfpapjjmafapmmgkkhgoa";
const webStoreCrx = readFileSync(
	join(import.meta.dir, "fixtures/json-formatter-0.10.2.crx"),
);
const archiveOffset = 12 + webStoreCrx.readUInt32LE(8);

const tempDirs: string[] = [];
afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function emptyExtensionsDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "web-store-crx-"));
	tempDirs.push(dir);
	return dir;
}

async function downloadServed(crx: Buffer, extensionsDir: string) {
	const server = createServer((_req, res) => res.end(crx));
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	try {
		return await downloadExtensionFromURL(
			`http://127.0.0.1:${port}/extension.crx`,
			extensionsDir,
			JSON_FORMATTER_ID,
		);
	} finally {
		server.close();
	}
}

function u32(value: number): Buffer {
	const bytes = Buffer.alloc(4);
	bytes.writeUInt32LE(value);
	return bytes;
}

test("a Web Store download reaches disk only when its CRX3 signatures verify", async () => {
	enableCrxVerification();

	const installed = await downloadServed(webStoreCrx, emptyExtensionsDir());
	expect(installed.endsWith(join(JSON_FORMATTER_ID, "0.10.2_0"))).toBe(true);

	const flipped = Buffer.from(webStoreCrx);
	const middleOfArchive =
		archiveOffset + Math.floor((flipped.length - archiveOffset) / 2);
	flipped[middleOfArchive] = (flipped[middleOfArchive] as number) ^ 0x01;
	const flippedDir = emptyExtensionsDir();
	await expect(downloadServed(flipped, flippedDir)).rejects.toThrow(
		/signature/i,
	);
	expect(readdirSync(flippedDir)).toEqual([]);

	const developerKey = Buffer.from(
		JSON.parse(readFileSync(join(installed, "manifest.json"), "utf8")).key,
		"base64",
	);
	const unsignedCrx2 = Buffer.concat([
		Buffer.from("Cr24"),
		u32(2),
		u32(developerKey.length),
		u32(0),
		developerKey,
		webStoreCrx.subarray(archiveOffset),
	]);
	const crx2Dir = emptyExtensionsDir();
	await expect(downloadServed(unsignedCrx2, crx2Dir)).rejects.toThrow(/CRX2/);
	expect(readdirSync(crx2Dir)).toEqual([]);
});

test("the Web Store page names the app once, even when the app name contains Chrome", () => {
	const preload = readFileSync(
		join(
			dirname(require.resolve("electron-chrome-web-store")),
			"../../chrome-web-store.preload.js",
		),
		"utf8",
	);
	const source = preload.slice(
		preload.indexOf("function updateBranding"),
		preload.indexOf("function getUAProductVersion"),
	);
	const labels = [{ innerText: "Add to Chrome" }];
	const runNow = (callback: () => void) => callback();
	const updateBranding = new Function(
		"document",
		"requestAnimationFrame",
		"setTimeout",
		`${source}; return updateBranding;`,
	)({ querySelectorAll: () => labels }, runNow, runNow);
	const appName = "Superset (Superset browser lacks Chrome extension support)";

	for (let pass = 0; pass < 5; pass++) updateBranding(appName);

	expect(labels[0]?.innerText).toBe(`Add to ${appName}`);
});

test("only the real Web Store origin gets the store API, and updates pass the access check", () => {
	const dist = join(
		dirname(require.resolve("electron-chrome-web-store")),
		"../..",
	);
	const preload = readFileSync(
		join(dist, "chrome-web-store.preload.js"),
		"utf8",
	);
	expect(preload).toContain(
		'if (location.origin === "https://chromewebstore.google.com") {',
	);
	for (const build of ["cjs/browser/index.js", "esm/browser/index.mjs"]) {
		const main = readFileSync(join(dist, build), "utf8");
		expect(main).toContain("if (senderOrigin !== WEBSTORE_URL) {");
		expect(main).not.toContain("startsWith(WEBSTORE_URL)");
		expect(main).toContain("await beforeUpdate({ id: extensionId");
		const update = main.slice(main.indexOf("async function updateExtension("));
		expect(update).toContain(
			"downloadExtensionFromURL(update.url, stagingPath, extensionId)",
		);
		expect(update.indexOf("await beforeUpdate(")).toBeLessThan(
			update.indexOf("rename(stagedPath, updatePath)"),
		);
		const install = main.slice(
			main.indexOf("async function installExtension("),
		);
		expect(install).toContain(
			`downloadExtension(extensionId, \`\${extensionsPath}.staging\`)`,
		);
		expect(install.indexOf("await opts.verifyInstall(")).toBeLessThan(
			install.indexOf("rename(stagedPath, extensionPath)"),
		);
	}
});

test("the Web Store page names the app only on its add and remove buttons", () => {
	const preload = readFileSync(
		join(
			dirname(require.resolve("electron-chrome-web-store")),
			"../../chrome-web-store.preload.js",
		),
		"utf8",
	);
	const start = preload.indexOf("function updateBranding");
	const spans = ["Add to Chrome", "Remove from Chrome", "Install Chrome"].map(
		(innerText) => ({ innerText }),
	);
	const updateBranding = new Function(
		"document",
		"requestAnimationFrame",
		"setTimeout",
		`${preload.slice(start, preload.indexOf("function getUAProductVersion", start))}; return updateBranding;`,
	)(
		{ querySelectorAll: () => spans },
		(callback: () => void) => callback(),
		() => {},
	) as (appName: string) => void;

	updateBranding("Superset");

	expect(spans.map((span) => span.innerText)).toEqual([
		"Add to Superset",
		"Remove from Superset",
		"Install Chrome",
	]);
});
