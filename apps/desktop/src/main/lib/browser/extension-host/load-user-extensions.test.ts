import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
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

async function start(paths: UserExtensionPaths) {
	const { session, loadExtension } = electronLikeSession();
	const turnedOff = await loadUserExtensions(session, paths, nameOf);
	return { turnedOff, loaded: loadExtension.mock.calls.map(([dir]) => dir) };
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

test("a changed manifest or an added file turns a signed extension off", async () => {
	const tamper: Array<(installed: string) => void> = [
		(installed) => {
			const file = join(installed, "manifest.json");
			const manifest = JSON.parse(readFileSync(file, "utf8"));
			manifest.permissions = ["<all_urls>"];
			writeFileSync(file, JSON.stringify(manifest, null, 2));
		},
		(installed) => writeFileSync(join(installed, "extra.js"), "alert(1)"),
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
