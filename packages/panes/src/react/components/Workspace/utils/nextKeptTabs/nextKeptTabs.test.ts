import { describe, expect, test } from "bun:test";
import { type KeptTabEntry, nextKeptTabs } from "./nextKeptTabs";

const all = () => true;

function show(
	tabIds: string[],
	{
		maxHidden = 2,
		isKeepable = all,
	}: { maxHidden?: number; isKeepable?: (tabId: string) => boolean } = {},
): readonly KeptTabEntry[] {
	let kept: readonly KeptTabEntry[] = [];
	for (const activeTabId of tabIds) {
		kept = nextKeptTabs({
			previous: kept,
			activeTabId,
			isKeepable,
			maxHidden,
		});
	}
	return kept;
}

const ids = (kept: readonly KeptTabEntry[]) => kept.map((k) => k.tabId);

describe("nextKeptTabs", () => {
	test("keeps the active tab and the most recently shown hidden ones", () => {
		expect(ids(show(["a", "b", "c"]))).toEqual(["a", "b", "c"]);
	});

	test("evicts the least recently shown hidden tab past the cap", () => {
		expect(ids(show(["a", "b", "c", "d"]))).toEqual(["b", "c", "d"]);
		expect(ids(show(["a", "b", "c", "a", "d"]))).toEqual(["a", "c", "d"]);
	});

	test("never evicts the active tab, even with no hidden slots", () => {
		expect(ids(show(["a", "b"], { maxHidden: 0 }))).toEqual(["b"]);
	});

	test("keeps mount order so reshowing a tab does not move it", () => {
		expect(ids(show(["a", "b", "c", "a"]))).toEqual(["a", "b", "c"]);
	});

	test("drops tabs that were closed or can no longer be kept", () => {
		const kept = show(["a", "b", "c"]);
		const next = nextKeptTabs({
			previous: kept,
			activeTabId: "c",
			isKeepable: (tabId) => tabId !== "a",
			maxHidden: 2,
		});
		expect(ids(next)).toEqual(["b", "c"]);
	});

	test("does not keep a tab that cannot be kept, but keeps the others", () => {
		const kept = show(["a", "terminal", "b"], {
			isKeepable: (tabId) => tabId !== "terminal",
		});
		expect(ids(kept)).toEqual(["a", "b"]);
	});

	test("keeps hidden tabs while no tab is active", () => {
		const kept = show(["a", "b"]);
		expect(
			ids(
				nextKeptTabs({
					previous: kept,
					activeTabId: null,
					isKeepable: all,
					maxHidden: 1,
				}),
			),
		).toEqual(["b"]);
	});

	test("returns the previous list when nothing changed", () => {
		const kept = show(["a", "b"]);
		expect(
			nextKeptTabs({
				previous: kept,
				activeTabId: "b",
				isKeepable: all,
				maxHidden: 2,
			}),
		).toBe(kept);
	});

	test("stays bounded over many switches", () => {
		const tabs = Array.from({ length: 20 }, (_, i) => `t${i}`);
		const switches = Array.from({ length: 500 }, (_, i) => tabs[(i * 7) % 20]);
		expect(show(switches as string[]).length).toBe(3);
	});
});
