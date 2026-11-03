import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExtensionState } from "./extension-state";

const scratch = mkdtempSync(join(tmpdir(), "extension-state-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const TRANSLATE = "aapbdbdomjkkjkaonfhkkikfgjllcleb";

// What a worker does: asks, runs its listeners, confirms.
function deliverWith(state: ReturnType<typeof createExtensionState>) {
	return (extension: { id: string; version: string }) => {
		const pending = state.pendingInstalled(extension);
		if (pending) state.markInstalledDelivered(extension, pending.version);
		return pending?.details ?? null;
	};
}
const VIMIUM = "dbepggeogbaibhgnhhndojpepiihcmeb";

test("runtime.onInstalled fires once per install and update, and once for extensions the app had before", () => {
	const file = join(scratch, "installed.json");
	const state = createExtensionState(file, () => [TRANSLATE]);
	const deliver = deliverWith(state);

	expect(deliver({ id: TRANSLATE, version: "2.0.18" })).toEqual({
		reason: "chrome_update",
	});
	expect(deliver({ id: VIMIUM, version: "2.4.2" })).toEqual({
		reason: "install",
	});
	expect(deliver({ id: VIMIUM, version: "2.4.2" })).toBeNull();

	const restarted = createExtensionState(file, () => []);
	const deliverAfterRestart = deliverWith(restarted);
	expect(deliverAfterRestart({ id: TRANSLATE, version: "2.0.18" })).toBeNull();
	expect(deliverAfterRestart({ id: VIMIUM, version: "2.5.0" })).toEqual({
		reason: "update",
		previousVersion: "2.4.2",
	});
	restarted.forget(VIMIUM);
	expect(deliverAfterRestart({ id: VIMIUM, version: "2.5.0" })).toEqual({
		reason: "install",
	});
});

test("right-click menu items come back after a restart, for their own extension and version only", () => {
	const file = join(scratch, "menus.json");
	const translate = { id: TRANSLATE, version: "2.0.18" };
	const item = {
		id: "translate",
		title: "Google Translate",
		contexts: ["selection"],
	};
	createExtensionState(file, () => []).saveMenus(translate, [item]);

	const restarted = createExtensionState(file, () => []);
	expect(restarted.restoreMenus(translate)).toEqual([item]);
	expect(restarted.restoreMenus({ id: VIMIUM, version: "2.0.18" })).toBeNull();

	restarted.saveMenus(translate, []);
	expect(
		createExtensionState(file, () => []).restoreMenus(translate),
	).toBeNull();

	restarted.saveMenus(translate, [item]);
	const updated = createExtensionState(file, () => []);
	expect(updated.restoreMenus({ id: TRANSLATE, version: "2.0.19" })).toBeNull();
	expect(updated.restoreMenus(translate)).toBeNull();
});
