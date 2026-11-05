/**
 * Test preload: give every test run its own Superset home.
 *
 * Production code resolves `~/.paradev` from `SUPERSET_HOME_DIR` (see
 * agent-setup's resolveAppHomeDir and the mirror in the usage router's
 * default-account.ts). A test that calls such code with the variable unset
 * writes to the developer's REAL home. That is not hypothetical: the default
 * agent-account tests wrote `$TMPDIR` into the live
 * `~/.paradev/state/default-codex-home` pointer, which every Superset
 * terminal and agent launch then injected as `CODEX_HOME`, so Codex ran
 * signed out with none of its session history and re-logins landed in a
 * directory macOS periodically purges.
 *
 * Setting it here — before any test module loads — makes that whole class of
 * accident impossible rather than something each test file has to remember.
 *
 * The override is unconditional, and that is the point. Every Superset
 * terminal exports `SUPERSET_HOME_DIR=~/.paradev`, and that is where the
 * team runs `bun test`, so the variable is not merely unset-and-forgotten —
 * it arrives already aimed at the real home. A `??=` default would be a
 * no-op in exactly the environment that needs it. Tests wanting a specific
 * home still set one in their own `beforeEach`, which runs after this.
 *
 * Loaded from the root bunfig.toml and re-entered by each package preload
 * that has one; `test/superset-home-isolation.test.ts` fails loudly if a run
 * ever loses it.
 */

import { afterAll, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock Electron so tests importing 'electron' don't fail in headless Bun runtime
mock.module("electron", () => ({
	webContents: {
		fromId: mock(() => null),
	},
	clipboard: {
		write: mock(() => Promise.resolve()),
		writeText: mock(() => Promise.resolve()),
		readText: mock(() => ""),
		writeImage: mock(),
	},
	Menu: {
		buildFromTemplate: mock((items: unknown) => ({
			popup: mock(),
			items,
		})),
		setApplicationMenu: mock(),
	},
	shell: {
		openExternal: mock(async () => {}),
		openPath: mock(async () => ""),
		showItemInFolder: mock(() => {}),
		beep: mock(() => {}),
	},
	app: {
		isPackaged: false,
		getVersion: () => "0.0.0",
		getName: () => "test-app",
		getAppPath: () => "/tmp/app",
		getPath: (name: string) => `/tmp/${name}`,
		on: mock(),
		whenReady: mock(async () => {}),
	},
	BrowserWindow: Object.assign(
		mock(() => ({
			webContents: {
				on: mock(),
				off: mock(),
				setAudioMuted: mock(),
				setWindowOpenHandler: mock(),
				send: mock(),
			},
			on: mock(),
			once: mock(),
			loadURL: mock(async () => {}),
			close: mock(),
			destroy: mock(),
		})),
		{ getFocusedWindow: mock(() => null), getAllWindows: mock(() => []) },
	),
	WebContentsView: mock(() => ({
		webContents: {
			send: mock(),
			once: mock(),
			loadURL: mock(() => Promise.resolve()),
			close: mock(),
		},
	})),
	nativeImage: {
		createEmpty: () => ({
			isEmpty: () => true,
			toPNG: () => Buffer.from(""),
			toJPEG: () => Buffer.from(""),
			getSize: () => ({ width: 0, height: 0 }),
		}),
		createFromBuffer: () => ({
			isEmpty: () => false,
			toPNG: () => Buffer.from(""),
			toJPEG: () => Buffer.from(""),
			getSize: () => ({ width: 100, height: 100 }),
		}),
	},
	ipcMain: {
		on: mock(),
		handle: mock(),
		removeHandler: mock(),
	},
	dialog: {
		showOpenDialog: mock(() =>
			Promise.resolve({ canceled: false, filePaths: [] }),
		),
		showSaveDialog: mock(() =>
			Promise.resolve({ canceled: false, filePath: "" }),
		),
		showErrorBox: mock(),
		showMessageBox: mock(async () => ({ response: 0 })),
	},
	session: {
		defaultSession: {
			webRequest: {
				onBeforeSendHeaders: mock(),
				onHeadersReceived: mock(),
			},
		},
		fromPartition: mock(() => ({})),
	},
	screen: {
		getPrimaryDisplay: mock(() => ({
			workAreaSize: { width: 1920, height: 1080 },
			bounds: { x: 0, y: 0, width: 1920, height: 1080 },
		})),
		getAllDisplays: mock(() => [
			{
				bounds: { x: 0, y: 0, width: 1920, height: 1080 },
				workAreaSize: { width: 1920, height: 1080 },
			},
		]),
	},
	Notification: mock(() => ({
		show: mock(),
		on: mock(),
	})),
	powerMonitor: {
		getSystemIdleState: mock(() => "active"),
	},
	contextBridge: {
		executeInMainWorld: mock(),
		exposeInMainWorld: mock(),
	},
	ipcRenderer: undefined,
	net: {},
	ClipboardItem: class ClipboardItem {},
}));

const testSupersetHome = mkdtempSync(join(tmpdir(), "superset-test-home-"));
process.env.SUPERSET_HOME_DIR = testSupersetHome;
Reflect.set(
	globalThis,
	Symbol.for("superset.test.supersetHome"),
	testSupersetHome,
);

// Test processes are short-lived, but a full local run creates enough state
// here to make relying on the OS's eventual temp cleanup needlessly noisy.
// The exit hook is synchronous because Node/Bun cannot await async work once
// process shutdown has begun; best-effort cleanup must never mask test status.
function cleanupTestSupersetHome(): void {
	try {
		rmSync(testSupersetHome, { recursive: true, force: true });
	} catch {
		// The temp directory may already have been removed by a test.
	}
}

// Bun's test runner does not consistently emit Node's process exit event, so
// use its lifecycle hook as the primary cleanup and retain exit as a fallback
// for alternate runners that load the same preload.
afterAll(cleanupTestSupersetHome);
process.once("exit", cleanupTestSupersetHome);
