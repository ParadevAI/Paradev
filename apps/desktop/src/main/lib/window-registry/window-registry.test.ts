import { beforeEach, describe, expect, test } from "bun:test";
import type { BrowserWindow } from "electron";
import {
	__resetForTests,
	getAllWindows,
	getEntry,
	getFocusedOrLastWindow,
	getOrg,
	markFocused,
	registerWindow,
	setOrg,
	unregisterWindow,
	watchWindows,
} from "./window-registry";

/**
 * Minimal BrowserWindow stand-in. The registry only ever touches `id` and
 * `isDestroyed()`, so a plain object cast to BrowserWindow is sufficient and
 * keeps these tests free of the Electron runtime.
 */
function makeWindow(id: number, destroyed = false): BrowserWindow {
	let isDestroyed = destroyed;
	return {
		id,
		isDestroyed: () => isDestroyed,
		__destroy: () => {
			isDestroyed = true;
		},
	} as unknown as BrowserWindow & { __destroy: () => void };
}

beforeEach(() => {
	__resetForTests();
});

describe("window registry", () => {
	test("a watcher sees each open window, then each new one", () => {
		const first = makeWindow(1);
		const second = makeWindow(2);
		registerWindow({ window: first, orgId: null, key: "key-1" });
		const seen: BrowserWindow[] = [];
		watchWindows((window) => seen.push(window));
		registerWindow({ window: second, orgId: null, key: "key-2" });
		expect(seen).toEqual([first, second]);
	});

	test("a watcher that throws does not stop the others", () => {
		const seen: BrowserWindow[] = [];
		watchWindows(() => {
			throw new Error("broken watcher");
		});
		watchWindows((window) => seen.push(window));
		const win = makeWindow(3);
		registerWindow({ window: win, orgId: null, key: "key-3" });
		expect(seen).toEqual([win]);
		expect(getEntry(3)?.window).toBe(win);
	});

	test("register then read entry and org", () => {
		const win = makeWindow(1);
		registerWindow({ window: win, orgId: "org-a", key: "key-14" });
		expect(getEntry(1)?.window).toBe(win);
		expect(getOrg(1)).toBe("org-a");
	});

	test("registering with null org returns null org", () => {
		registerWindow({ window: makeWindow(2), orgId: null, key: "key-207" });
		expect(getOrg(2)).toBeNull();
	});

	test("setOrg updates an existing entry", () => {
		registerWindow({ window: makeWindow(1), orgId: "org-a", key: "key-662" });
		setOrg({ windowId: 1, orgId: "org-b" });
		expect(getOrg(1)).toBe("org-b");
	});

	test("setOrg on unknown window is a no-op", () => {
		setOrg({ windowId: 99, orgId: "org-x" });
		expect(getOrg(99)).toBeNull();
	});

	test("unregister removes the entry", () => {
		registerWindow({ window: makeWindow(1), orgId: "org-a", key: "key-662" });
		unregisterWindow(1);
		expect(getEntry(1)).toBeUndefined();
		expect(getOrg(1)).toBeNull();
	});

	test("getAllWindows returns only live windows", () => {
		const live = makeWindow(1);
		const dead = makeWindow(2) as BrowserWindow & { __destroy: () => void };
		registerWindow({ window: live, orgId: null, key: "key-648" });
		registerWindow({ window: dead, orgId: null, key: "key-958" });
		dead.__destroy();
		expect(getAllWindows()).toEqual([live]);
	});

	test("getFocusedOrLastWindow prefers the most-recently-focused live window", () => {
		const a = makeWindow(1);
		const b = makeWindow(2);
		registerWindow({ window: a, orgId: null, key: "key-295" });
		registerWindow({ window: b, orgId: null, key: "key-118" });
		// b registered last -> currently most recent
		expect(getFocusedOrLastWindow()).toBe(b);
		markFocused(1);
		expect(getFocusedOrLastWindow()).toBe(a);
	});

	test("getFocusedOrLastWindow skips destroyed windows", () => {
		const a = makeWindow(1);
		const b = makeWindow(2) as BrowserWindow & { __destroy: () => void };
		registerWindow({ window: a, orgId: null, key: "key-295" });
		registerWindow({ window: b, orgId: null, key: "key-118" });
		b.__destroy(); // most-recent but dead
		expect(getFocusedOrLastWindow()).toBe(a);
	});

	test("getFocusedOrLastWindow returns null with no live windows", () => {
		expect(getFocusedOrLastWindow()).toBeNull();
		const a = makeWindow(1);
		registerWindow({ window: a, orgId: null, key: "key-295" });
		unregisterWindow(1);
		expect(getFocusedOrLastWindow()).toBeNull();
	});

	test("markFocused on unknown window does not add it", () => {
		markFocused(42);
		expect(getFocusedOrLastWindow()).toBeNull();
	});
});
