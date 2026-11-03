import { afterEach, expect, mock, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { ElectronChromeExtensions } from "electron-chrome-extensions";
import {
	attachBrowserExtensions,
	removeBrowserExtension,
	setTurnedOffBrowserExtensions,
} from "./browser-extensions";
import { userExtensionPaths } from "./web-store";

const EXTENSION_ID = "c".repeat(32);
const turnedOffDir = () =>
	path.join(userExtensionPaths().turnedOffPath, EXTENSION_ID);
const rulesFile = () =>
	path.join(
		app.getPath("userData"),
		"browser-extension-rules",
		`${EXTENSION_ID}.json`,
	);

afterEach(() => {
	if (existsSync(userExtensionPaths().turnedOffPath)) {
		chmodSync(userExtensionPaths().turnedOffPath, 0o755);
	}
	rmSync(turnedOffDir(), { recursive: true, force: true });
	rmSync(rulesFile(), { force: true });
});

function attachTurnedOff(onRemoved: (id: string) => void = () => {}) {
	const session = {
		extensions: {
			on: () => {},
			getExtension: () => undefined,
			getAllExtensions: () => [],
		},
		clearStorageData: mock(async () => {}),
	};
	const extensions = {
		on: () => {},
		api: {
			browserAction: {
				getState: () => ({ actions: [] }),
				activate: () => {},
				handleCRXRequest: () => new Response(null, { status: 404 }),
				observers: new Set(),
			},
		},
	} as unknown as ElectronChromeExtensions;
	attachBrowserExtensions({
		session: session as unknown as Electron.Session,
		extensions,
		tabOf: () => undefined,
		onRemoved,
	});
	mkdirSync(path.join(turnedOffDir(), "1.0_0"), { recursive: true });
	setTurnedOffBrowserExtensions([
		{ id: EXTENSION_ID, name: "Turned off", version: "1.0" },
	]);
	return session;
}

test("removing a turned-off extension deletes its files, data and saved rules", async () => {
	const session = attachTurnedOff();
	mkdirSync(path.dirname(rulesFile()), { recursive: true });
	writeFileSync(rulesFile(), "[]");

	await removeBrowserExtension(EXTENSION_ID);

	expect(existsSync(turnedOffDir())).toBe(false);
	expect(existsSync(rulesFile())).toBe(false);
	expect(session.clearStorageData).toHaveBeenCalledWith({
		origin: `chrome-extension://${EXTENSION_ID}`,
	});
});

test("removing a turned-off extension fails when its files cannot be deleted", async () => {
	const session = attachTurnedOff();
	chmodSync(userExtensionPaths().turnedOffPath, 0o555);

	await expect(removeBrowserExtension(EXTENSION_ID)).rejects.toThrow();

	expect(existsSync(turnedOffDir())).toBe(true);
	expect(session.clearStorageData).not.toHaveBeenCalled();
});

test("a removed extension's saved state is forgotten even when clearing its data fails", async () => {
	const onRemoved = mock((_id: string) => {});
	const session = attachTurnedOff(onRemoved);
	session.clearStorageData.mockImplementation(async () => {
		throw new Error("storage busy");
	});

	await expect(removeBrowserExtension(EXTENSION_ID)).rejects.toThrow(
		"storage busy",
	);

	expect(existsSync(turnedOffDir())).toBe(false);
	expect(onRemoved).toHaveBeenCalledWith(EXTENSION_ID);
});
