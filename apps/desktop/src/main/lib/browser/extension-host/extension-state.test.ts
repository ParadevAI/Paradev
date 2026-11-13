import { afterAll, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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

test("state that cannot be read is left as is, and no onInstalled fires on a guess", () => {
	const file = join(scratch, "unreadable.json");
	writeFileSync(file, JSON.stringify({ installed: { [VIMIUM]: "2.4.2" } }));
	chmodSync(file, 0o000);
	try {
		const state = createExtensionState(file, () => []);
		expect(state.pendingInstalled({ id: VIMIUM, version: "2.5.0" })).toBeNull();
		state.saveMenus({ id: VIMIUM, version: "2.5.0" }, [{ id: "item" }]);
	} finally {
		chmodSync(file, 0o644);
	}
	expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
		installed: { [VIMIUM]: "2.4.2" },
	});
});

test("an unlistable install folder records nothing and fires no onInstalled", () => {
	const file = join(scratch, "unlisted.json");
	const state = createExtensionState(file, () => {
		throw new Error("EACCES");
	});
	expect(state.pendingInstalled({ id: VIMIUM, version: "2.4.2" })).toBeNull();
	expect(existsSync(file)).toBe(false);
});

test("corrupt state is moved aside, and malformed entries are dropped", () => {
	const corrupt = join(scratch, "corrupt.json");
	writeFileSync(corrupt, "{not json");
	const fresh = createExtensionState(corrupt, () => [TRANSLATE]);
	expect(readFileSync(`${corrupt}.corrupt`, "utf8")).toBe("{not json");
	expect(fresh.pendingInstalled({ id: TRANSLATE, version: "2.0.18" })).toEqual({
		details: { reason: "chrome_update" },
		version: "2.0.18",
	});

	const malformed = join(scratch, "malformed.json");
	writeFileSync(
		malformed,
		JSON.stringify({
			installed: { [TRANSLATE]: 5, [VIMIUM]: "2.4.2" },
			menus: { [VIMIUM]: { version: "2.4.2", items: "nope" } },
		}),
	);
	const state = createExtensionState(malformed, () => []);
	expect(state.pendingInstalled({ id: TRANSLATE, version: "2.0.18" })).toEqual({
		details: { reason: "install" },
		version: "2.0.18",
	});
	expect(state.pendingInstalled({ id: VIMIUM, version: "2.4.2" })).toBeNull();
	expect(state.restoreMenus({ id: VIMIUM, version: "2.4.2" })).toBeNull();
});
