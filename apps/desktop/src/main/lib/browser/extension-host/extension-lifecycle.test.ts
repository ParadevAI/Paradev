import { afterAll, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INSTALLED_CHANNEL } from "shared/browser-extension-installed";
import { trackExtensionLifecycle } from "./extension-lifecycle";
import { createExtensionState } from "./extension-state";

const scratch = mkdtempSync(join(tmpdir(), "extension-lifecycle-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const TRANSLATE = "aapbdbdomjkkjkaonfhkkikfgjllcleb";

function start(stateFile: string, installedBefore: string[] = []) {
	const loaded = new Map<string, { id: string; version: string }>();
	const sessionExtensions = Object.assign(new EventEmitter(), {
		getExtension: (id: string) => loaded.get(id),
	});
	const serviceWorkers = new EventEmitter();
	const workerHandlers = new Map<string, (...args: unknown[]) => unknown>();
	const worker = {
		scope: `chrome-extension://${TRANSLATE}/`,
		ipc: {
			handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
				workerHandlers.set(channel, handler),
		},
	};
	Object.assign(serviceWorkers, { getWorkerFromVersionID: () => worker });
	const restored: unknown[][] = [];
	const extensions = Object.assign(new EventEmitter(), {
		restoreContextMenuItems: (...args: unknown[]) => restored.push(args),
	});
	trackExtensionLifecycle({
		session: {
			extensions: sessionExtensions,
			serviceWorkers,
		} as unknown as Electron.Session,
		extensions: extensions as never,
		state: createExtensionState(
			join(scratch, stateFile),
			() => installedBefore,
		),
	});
	const load = (version: string) => {
		const extension = { id: TRANSLATE, version };
		loaded.set(TRANSLATE, extension);
		sessionExtensions.emit("extension-loaded", {}, extension);
	};
	const ask = (...request: unknown[]) =>
		workerHandlers.get(INSTALLED_CHANNEL)?.({}, ...request);
	// A worker that adds an onInstalled listener runs it, then confirms.
	const startWorker = ({ stopsBeforeListenerRuns = false } = {}) => {
		serviceWorkers.emit("running-status-changed", { versionId: 1 });
		const pending = ask("pending") as { details: unknown; version: string };
		if (pending && !stopsBeforeListenerRuns) ask("delivered", pending.version);
		return pending?.details ?? null;
	};
	return { extensions, restored, load, startWorker };
}

test("Google Translate's onInstalled menu item survives a restart, and an update asks for it again", () => {
	const first = start("translate.json");
	first.load("2.0.18");
	expect(first.startWorker()).toEqual({ reason: "install" });
	const item = { id: "translate", title: "Translate", contexts: ["selection"] };
	first.extensions.emit("context-menus-changed", TRANSLATE, [item]);

	const restart = start("translate.json");
	restart.load("2.0.18");
	expect(restart.restored).toEqual([[TRANSLATE, [item]]]);
	expect(restart.startWorker()).toBeNull();

	const update = start("translate.json");
	update.load("2.0.19");
	expect(update.restored).toEqual([]);
	expect(update.startWorker()).toEqual({
		reason: "update",
		previousVersion: "2.0.18",
	});
});

test("onInstalled reaches Google Translate again until its listener has run, also for an install from before", () => {
	const asleep = start("asleep.json", [TRANSLATE]);
	asleep.load("2.0.18");
	expect(asleep.startWorker({ stopsBeforeListenerRuns: true })).toEqual({
		reason: "chrome_update",
	});

	const restart = start("asleep.json");
	restart.load("2.0.18");
	expect(restart.startWorker()).toEqual({ reason: "chrome_update" });
	const again = start("asleep.json");
	again.load("2.0.18");
	expect(again.startWorker()).toBeNull();
});
