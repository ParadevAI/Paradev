import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
	appendFileSync,
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadExtensionFromURL } from "electron-chrome-web-store";
import { recordPath } from "./extension-integrity";
import {
	loadUserExtensions,
	type UserExtensionPaths,
} from "./load-user-extensions";
import {
	STORAGE_SHIM_SCRIPT,
	shimStorageOnLoad,
	storageShimSource,
} from "./storage-shim-files";
import { enableCrxVerification, userExtensionPaths } from "./web-store";

const JSON_FORMATTER_ID = "bcjindcccaagfpapjjmafapmmgkkhgoa";
const VERSION = "0.10.2";
const webStoreCrx = readFileSync(
	join(import.meta.dir, "fixtures/json-formatter-0.10.2.crx"),
);

const tempDirs: string[] = [];
const consoleError = console.error;
const consoleLog = console.log;
beforeEach(() => {
	console.error = () => {};
	console.log = () => {};
});
afterEach(() => {
	console.error = consoleError;
	console.log = consoleLog;
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
	rmSync(userExtensionPaths().manifestsPath, { recursive: true, force: true });
});

function freshPaths(): UserExtensionPaths {
	const root = mkdtempSync(join(tmpdir(), "user-extensions-"));
	tempDirs.push(root);
	return {
		extensionsPath: join(root, "extensions"),
		manifestsPath: userExtensionPaths().manifestsPath,
		turnedOffPath: join(root, "turned-off"),
	};
}

// The same download and unpack an install and an update run.
async function downloadFromWebStore(extensionsPath: string): Promise<string> {
	enableCrxVerification();
	const server = createServer((_req, res) => res.end(webStoreCrx));
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	try {
		return await downloadExtensionFromURL(
			`http://127.0.0.1:${port}/extension.crx`,
			extensionsPath,
			JSON_FORMATTER_ID,
		);
	} finally {
		server.close();
	}
}

// Electron's loadExtension deletes the extension's _metadata folder.
function electronLikeSession() {
	const loadExtension = mock(async (dir: string) => {
		rmSync(join(dir, "_metadata"), { recursive: true, force: true });
		return { id: JSON_FORMATTER_ID, path: dir, manifest: {} };
	});
	const session = {
		extensions: { loadExtension },
		serviceWorkers: { startWorkerForScope: mock(async () => {}) },
	} as unknown as Pick<Electron.Session, "extensions" | "serviceWorkers">;
	return { session, loadExtension };
}

const nameOf = async (_dir: string, manifest: chrome.runtime.Manifest) =>
	manifest.name;

async function start(paths: UserExtensionPaths, { shim = false } = {}) {
	const { session, loadExtension } = electronLikeSession();
	if (shim)
		shimStorageOnLoad(session as Electron.Session, paths.extensionsPath);
	const turnedOff = await loadUserExtensions(session, paths, nameOf);
	return { turnedOff, loaded: loadExtension.mock.calls.map(([dir]) => dir) };
}

function contentScripts(installed: string): { js?: string[] }[] {
	return JSON.parse(readFileSync(join(installed, "manifest.json"), "utf8"))
		.content_scripts;
}

function readRecord(paths: UserExtensionPaths): Record<string, unknown> {
	return JSON.parse(
		readFileSync(
			recordPath(paths.manifestsPath, JSON_FORMATTER_ID, VERSION),
			"utf8",
		),
	);
}

test("signed hashes saved at install still check the extension after Electron deletes _metadata", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);

	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [installed] });
	expect(existsSync(join(installed, "_metadata"))).toBe(false);
	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [installed] });
	expect(readRecord(paths)).toHaveProperty("verifiedContents");

	appendFileSync(join(installed, "content.js"), "\nfetch('https://evil');");
	expect(await start(paths)).toEqual({
		turnedOff: [
			{ id: JSON_FORMATTER_ID, name: "JSON Formatter", version: VERSION },
		],
		loaded: [],
	});
	expect(existsSync(join(paths.extensionsPath, JSON_FORMATTER_ID))).toBe(false);
});

test("a changed, added, missing or symlinked file turns a signed extension off", async () => {
	const tamper: Array<(installed: string) => void> = [
		(installed) => {
			const file = join(installed, "manifest.json");
			const manifest = JSON.parse(readFileSync(file, "utf8"));
			manifest.permissions = ["<all_urls>"];
			writeFileSync(file, JSON.stringify(manifest, null, 2));
		},
		(installed) => writeFileSync(join(installed, "extra.js"), "alert(1)"),
		(installed) => rmSync(join(installed, "options/options.js")),
		(installed) => rmSync(join(installed, "manifest.json")),
		(installed) => {
			rmSync(join(installed, "content.js"));
			symlinkSync("/etc/hosts", join(installed, "content.js"));
		},
	];
	for (const change of tamper) {
		const paths = freshPaths();
		change(await downloadFromWebStore(paths.extensionsPath));

		const { turnedOff, loaded } = await start(paths);

		expect(loaded).toEqual([]);
		expect(turnedOff.map(({ id }) => id)).toEqual([JSON_FORMATTER_ID]);
	}
});

test("an install from before records, without _metadata, loads and is checked from then on", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	rmSync(join(installed, "_metadata"), { recursive: true });
	rmSync(paths.manifestsPath, { recursive: true });

	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [installed] });
	expect(readRecord(paths)).toHaveProperty("fileSha256");
	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [installed] });

	appendFileSync(join(installed, "options/options.js"), "\nalert(1);");
	const { turnedOff, loaded } = await start(paths);
	expect(loaded).toEqual([]);
	expect(turnedOff.map(({ id }) => id)).toEqual([JSON_FORMATTER_ID]);
});

test("an unusable record never turns an extension off", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	writeFileSync(
		recordPath(paths.manifestsPath, JSON_FORMATTER_ID, VERSION),
		"{not json",
	);

	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [installed] });
	expect(existsSync(installed)).toBe(true);
});

test("an update replaces a trusted record with the signed one", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	rmSync(paths.manifestsPath, { recursive: true });
	await start(paths);
	expect(readRecord(paths)).toHaveProperty("fileSha256");

	// The package's update: unpack to staging, then replace the folder.
	const staged = await downloadFromWebStore(`${paths.extensionsPath}.staging`);
	rmSync(installed, { recursive: true });
	renameSync(staged, installed);

	expect(readRecord(paths)).toHaveProperty("verifiedContents");
	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [installed] });
});

test("the storage shim survives restarts as a known change, and any other change still turns the extension off", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	const options = join(installed, "options/options.html");

	expect(await start(paths, { shim: true })).toEqual({
		turnedOff: [],
		loaded: [installed],
	});
	expect(contentScripts(installed).map(({ js }) => js)).toEqual([
		[STORAGE_SHIM_SCRIPT, "content.js"],
		["set-json-global.js"],
	]);
	expect(readFileSync(options, "utf8")).toContain(STORAGE_SHIM_SCRIPT);

	writeFileSync(join(installed, STORAGE_SHIM_SCRIPT), "alert(1)");
	expect(await start(paths, { shim: true })).toEqual({
		turnedOff: [],
		loaded: [installed],
	});
	expect(
		readFileSync(join(installed, STORAGE_SHIM_SCRIPT)).equals(
			storageShimSource(),
		),
	).toBe(true);

	appendFileSync(join(installed, "content.js"), "\nfetch('https://evil');");
	const { turnedOff, loaded } = await start(paths, { shim: true });
	expect(loaded).toEqual([]);
	expect(turnedOff.map(({ id }) => id)).toEqual([JSON_FORMATTER_ID]);
});

test("a shim tag moved within a page, or another script beside the shim, turns the extension off", async () => {
	const tamper: Array<(installed: string) => void> = [
		(installed) => {
			const file = join(installed, "options/options.html");
			const html = readFileSync(file, "utf8");
			const tag = `<script src="/${STORAGE_SHIM_SCRIPT}"></script>`;
			writeFileSync(file, `${html.replace(tag, "")}${tag}`);
		},
		(installed) => {
			const file = join(installed, "manifest.json");
			const manifest = JSON.parse(readFileSync(file, "utf8"));
			manifest.content_scripts[0].js.push("lib/extra.js");
			writeFileSync(file, JSON.stringify(manifest, null, 2));
		},
	];
	for (const change of tamper) {
		const paths = freshPaths();
		const installed = await downloadFromWebStore(paths.extensionsPath);
		await start(paths, { shim: true });
		change(installed);

		const { turnedOff, loaded } = await start(paths, { shim: true });

		expect(loaded).toEqual([]);
		expect(turnedOff.map(({ id }) => id)).toEqual([JSON_FORMATTER_ID]);
	}
});

test("an install from before records and the shim loads, and its record learns the shimmed manifest", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	rmSync(join(installed, "_metadata"), { recursive: true });
	rmSync(paths.manifestsPath, { recursive: true });
	await start(paths);
	// A record written before the shim existed has hashes only.
	const file = recordPath(paths.manifestsPath, JSON_FORMATTER_ID, VERSION);
	const { fileSha256 } = readRecord(paths);
	writeFileSync(file, JSON.stringify({ fileSha256 }));

	expect(await start(paths, { shim: true })).toEqual({
		turnedOff: [],
		loaded: [installed],
	});
	expect(contentScripts(installed)[0]?.js?.[0]).toBe(STORAGE_SHIM_SCRIPT);
	expect(await start(paths, { shim: true })).toEqual({
		turnedOff: [],
		loaded: [installed],
	});

	appendFileSync(join(installed, "content.js"), "\nalert(1);");
	const { turnedOff, loaded } = await start(paths, { shim: true });
	expect(loaded).toEqual([]);
	expect(turnedOff.map(({ id }) => id)).toEqual([JSON_FORMATTER_ID]);
});

test("an install with no record turns off when it holds a symlink", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	rmSync(paths.manifestsPath, { recursive: true });
	symlinkSync("/etc/hosts", join(installed, "linked.js"));

	const { turnedOff, loaded } = await start(paths);

	expect(loaded).toEqual([]);
	expect(turnedOff.map(({ id }) => id)).toEqual([JSON_FORMATTER_ID]);
});

test("a file named __proto__ keeps its trusted hash", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	rmSync(paths.manifestsPath, { recursive: true });
	writeFileSync(join(installed, "__proto__"), "data");

	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [installed] });
	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [installed] });
});

test("an earlier turned-off copy stays when moving the new one out fails", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	const earlier = join(paths.turnedOffPath, JSON_FORMATTER_ID);
	mkdirSync(paths.turnedOffPath, { recursive: true });
	cpSync(join(paths.extensionsPath, JSON_FORMATTER_ID), earlier, {
		recursive: true,
	});
	appendFileSync(join(installed, "content.js"), "\nalert(1);");
	chmodSync(paths.extensionsPath, 0o555);
	try {
		const { turnedOff, loaded } = await start(paths);
		expect(loaded).toEqual([]);
		expect(turnedOff.map(({ id }) => id)).toEqual([JSON_FORMATTER_ID]);
		expect(existsSync(join(earlier, `${VERSION}_0`, "manifest.json"))).toBe(
			true,
		);
	} finally {
		chmodSync(paths.extensionsPath, 0o755);
	}
});

test("an unreadable or malformed turned-off extension is listed by its id", async () => {
	const paths = freshPaths();
	const malformedId = "a".repeat(32);
	const unreadableId = "b".repeat(32);
	const malformed = join(paths.turnedOffPath, malformedId, "1.0_0");
	mkdirSync(malformed, { recursive: true });
	writeFileSync(join(malformed, "manifest.json"), '"a string"');
	const unreadable = join(paths.turnedOffPath, unreadableId);
	mkdirSync(unreadable, { recursive: true });
	chmodSync(unreadable, 0o000);
	try {
		const { turnedOff } = await start(paths);
		expect(turnedOff.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
			{ id: malformedId, name: malformedId, version: "" },
			{ id: unreadableId, name: unreadableId, version: "" },
		]);
	} finally {
		chmodSync(unreadable, 0o755);
	}
});

test("a version folder that is a symlink is never loaded", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	rmSync(paths.manifestsPath, { recursive: true });
	const elsewhere = join(paths.extensionsPath, "..", "elsewhere");
	renameSync(installed, elsewhere);
	symlinkSync(elsewhere, installed);

	expect(await start(paths)).toEqual({ turnedOff: [], loaded: [] });
});
