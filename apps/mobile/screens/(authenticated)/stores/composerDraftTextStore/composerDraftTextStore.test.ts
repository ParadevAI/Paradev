import { beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";

const disk = new Map<string, string>();
const diskStorage = {
	getItem: (key: string) => disk.get(key) ?? null,
	setItem: (key: string, value: string) => {
		disk.set(key, value);
	},
	removeItem: (key: string) => {
		disk.delete(key);
	},
};
// Bun resolves AsyncStorage to its web build, which needs `window` for the
// hydration that runs at import. Other suites may replace AsyncStorage, so the
// store is pointed at `disk` directly below.
Object.assign(globalThis, { window: { localStorage: diskStorage } });

const { useComposerDraftTextStore } = await import("./composerDraftTextStore");
useComposerDraftTextStore.persist.setOptions({
	storage: createJSONStorage(() => diskStorage),
});

// A kill loses memory, not disk. Resetting the store writes too, so the disk
// is put back before reading it.
const relaunch = async () => {
	const saved = new Map(disk);
	useComposerDraftTextStore.setState({ textByKey: {}, hasHydrated: false });
	disk.clear();
	for (const [key, value] of saved) disk.set(key, value);
	await useComposerDraftTextStore.persist.rehydrate();
};

beforeEach(async () => {
	disk.clear();
	await relaunch();
});

describe("composerDraftTextStore", () => {
	test("a long dictated draft survives the app being killed", async () => {
		const fifteenMinutes = "and then we talked about the release ".repeat(600);
		useComposerDraftTextStore.getState().setText("home", fifteenMinutes);

		await relaunch();

		const state = useComposerDraftTextStore.getState();
		expect(state.hasHydrated).toBe(true);
		expect(state.textByKey.home).toBe(fifteenMinutes);
	});

	test("a sent draft does not come back after a relaunch", async () => {
		useComposerDraftTextStore.getState().setText("home", "hello");
		useComposerDraftTextStore.getState().setText("home", "");

		await relaunch();

		expect(useComposerDraftTextStore.getState().textByKey).toEqual({});
	});

	test("keeps the 50 most recently written drafts", () => {
		const { setText } = useComposerDraftTextStore.getState();
		for (let index = 0; index < 50; index++) setText(`workspace:${index}`, "x");
		setText("workspace:0", "touched");
		setText("workspace:50", "x");

		const keys = Object.keys(useComposerDraftTextStore.getState().textByKey);
		expect(keys).toHaveLength(50);
		expect(keys).toContain("workspace:0");
		expect(keys).not.toContain("workspace:1");
	});
});
