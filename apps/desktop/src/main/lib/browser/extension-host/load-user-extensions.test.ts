import { afterEach, expect, mock, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
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
afterEach(() => {
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

function fakeSession() {
	const loadExtension = mock(async (dir: string) => ({
		id: JSON_FORMATTER_ID,
		path: dir,
		manifest: { manifest_version: 3 },
	}));
	const session = {
		extensions: { loadExtension },
		serviceWorkers: { startWorkerForScope: mock(async () => {}) },
	} as unknown as Pick<Electron.Session, "extensions" | "serviceWorkers">;
	return { session, loadExtension };
}

const nameOf = async (_dir: string, manifest: chrome.runtime.Manifest) =>
	manifest.name;

test("an extension whose files match the Web Store's signed hashes loads", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	const { session, loadExtension } = fakeSession();

	const turnedOff = await loadUserExtensions(session, paths, nameOf);

	expect(turnedOff).toEqual([]);
	expect(loadExtension.mock.calls).toEqual([[installed]]);
});

test("an extension with a changed file is not loaded and is listed as turned off", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	appendFileSync(join(installed, "content.js"), "\nfetch('https://evil');");
	const { session, loadExtension } = fakeSession();
	const errors = mock(() => {});
	const consoleError = console.error;
	console.error = errors;
	try {
		const turnedOff = await loadUserExtensions(session, paths, nameOf);

		expect(loadExtension).not.toHaveBeenCalled();
		expect(turnedOff).toEqual([
			{ id: JSON_FORMATTER_ID, name: "JSON Formatter", version: VERSION },
		]);
		expect(String(errors.mock.calls[0])).toContain("content.js changed");
		expect(existsSync(join(paths.extensionsPath, JSON_FORMATTER_ID))).toBe(
			false,
		);
	} finally {
		console.error = consoleError;
	}
});

test("a changed manifest, an added file or a missing signature turns the extension off", async () => {
	const tamper: Array<(installed: string) => void> = [
		(installed) => {
			const file = join(installed, "manifest.json");
			const manifest = JSON.parse(readFileSync(file, "utf8"));
			manifest.permissions = ["<all_urls>"];
			writeFileSync(file, JSON.stringify(manifest, null, 2));
		},
		(installed) => writeFileSync(join(installed, "extra.js"), "alert(1)"),
		(installed) => rmSync(join(installed, "_metadata/verified_contents.json")),
	];
	const consoleError = console.error;
	console.error = () => {};
	try {
		for (const change of tamper) {
			const paths = freshPaths();
			change(await downloadFromWebStore(paths.extensionsPath));
			const { session, loadExtension } = fakeSession();

			const turnedOff = await loadUserExtensions(session, paths, nameOf);

			expect(loadExtension).not.toHaveBeenCalled();
			expect(turnedOff.map(({ id }) => id)).toEqual([JSON_FORMATTER_ID]);
		}
	} finally {
		console.error = consoleError;
	}
});

test("an install from before saved manifests is trusted once, then checked", async () => {
	const paths = freshPaths();
	const installed = await downloadFromWebStore(paths.extensionsPath);
	rmSync(recordPath(paths.manifestsPath, JSON_FORMATTER_ID, VERSION));

	const first = fakeSession();
	expect(await loadUserExtensions(first.session, paths, nameOf)).toEqual([]);
	expect(first.loadExtension).toHaveBeenCalledTimes(1);

	appendFileSync(join(installed, "manifest.json"), " ");
	const consoleError = console.error;
	console.error = () => {};
	try {
		const second = fakeSession();
		expect(
			(await loadUserExtensions(second.session, paths, nameOf)).length,
		).toBe(1);
		expect(second.loadExtension).not.toHaveBeenCalled();
	} finally {
		console.error = consoleError;
	}
});

test("an update saves the manifest of the version it unpacks", async () => {
	const paths = freshPaths();
	await downloadFromWebStore(paths.extensionsPath);
	const record = recordPath(paths.manifestsPath, JSON_FORMATTER_ID, VERSION);
	writeFileSync(record, JSON.stringify({ manifestSha256: "stale" }));
	const consoleError = console.error;
	console.error = () => {};
	try {
		const stale = fakeSession();
		await loadUserExtensions(stale.session, paths, nameOf);
		expect(stale.loadExtension).not.toHaveBeenCalled();
	} finally {
		console.error = consoleError;
	}

	rmSync(paths.turnedOffPath, { recursive: true, force: true });
	const updated = await downloadFromWebStore(paths.extensionsPath);
	const { session, loadExtension } = fakeSession();

	expect(await loadUserExtensions(session, paths, nameOf)).toEqual([]);
	expect(loadExtension.mock.calls).toEqual([[updated]]);
	expect(JSON.parse(readFileSync(record, "utf8"))).toHaveProperty("manifest");
});
