import { describe, expect, test } from "bun:test";
import {
	createKeptWorkspacesStore,
	KEPT_WORKSPACE_LIMIT,
	RECENT_WORKSPACES_KEY,
	STARTUP_PREWARM_LIMIT,
} from "./keptWorkspacesStore";

function setup(initialRecent?: string[]) {
	const values = new Map<string, string>();
	if (initialRecent) {
		values.set(RECENT_WORKSPACES_KEY, JSON.stringify(initialRecent));
	}
	const scheduled: (() => void)[] = [];
	let clock = 0;
	const store = createKeptWorkspacesStore({
		storage: {
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => void values.set(key, value),
		},
		scheduleIdle: (run) => void scheduled.push(run),
		now: () => ++clock,
	});
	const runScheduled = () => {
		while (scheduled.length > 0) scheduled.shift()?.();
	};
	const recent = () =>
		JSON.parse(values.get(RECENT_WORKSPACES_KEY) ?? "[]") as string[];
	const ids = () => store.get().map((entry) => entry.id);
	return { store, runScheduled, recent, ids };
}

const workspaceIds = (count: number) =>
	Array.from({ length: count }, (_, index) => `w${index}`);

describe("keptWorkspacesStore", () => {
	test("evicts the least recently opened workspace, never the one just opened", () => {
		const { store, ids } = setup();
		for (const id of workspaceIds(KEPT_WORKSPACE_LIMIT)) store.visit(id);
		store.visit("w0");
		store.visit("new");

		expect(ids()).toHaveLength(KEPT_WORKSPACE_LIMIT);
		expect(ids()).toContain("new");
		expect(ids()).toContain("w0");
		expect(ids()).not.toContain("w1");
	});

	test("keeps the DOM order of kept workspaces when one is opened again", () => {
		const { store, ids } = setup();
		store.visit("a");
		store.visit("b");
		store.visit("a");

		expect(ids()).toEqual(["a", "b"]);
	});

	test("prewarm adds an unopened entry that goes first on eviction", () => {
		const { store, ids } = setup();
		store.prewarm("warm");
		expect(store.get()).toEqual([{ id: "warm", usedAt: 0, shown: false }]);

		for (const id of workspaceIds(KEPT_WORKSPACE_LIMIT - 1)) store.visit(id);
		store.visit("next");
		expect(ids()).not.toContain("warm");
		expect(ids()).toContain("next");
	});

	test("prewarm on a full set replaces an unopened entry, never an opened one", () => {
		const { store, ids } = setup();
		for (const id of workspaceIds(KEPT_WORKSPACE_LIMIT - 1)) store.visit(id);
		store.prewarm("first");
		store.prewarm("second");
		expect(ids()).toContain("second");
		expect(ids()).not.toContain("first");

		store.visit("second");
		store.prewarm("third");
		expect(ids()).not.toContain("third");
		expect(ids()).toHaveLength(KEPT_WORKSPACE_LIMIT);
	});

	test("records opened workspaces most recent first, capped, and skips prewarms", () => {
		const { store, recent } = setup();
		for (const id of workspaceIds(KEPT_WORKSPACE_LIMIT + 2)) store.visit(id);
		store.visit("w3");
		store.prewarm("only-hovered");

		expect(recent()).toHaveLength(KEPT_WORKSPACE_LIMIT);
		expect(recent()[0]).toBe("w3");
		expect(recent()).not.toContain("only-hovered");
	});

	test("prewarms only the first few recent workspaces at startup", () => {
		const { store, runScheduled } = setup(workspaceIds(KEPT_WORKSPACE_LIMIT));
		store.prewarmRecent(() => true);
		runScheduled();
		expect(store.get()).toHaveLength(STARTUP_PREWARM_LIMIT);
	});

	test("prewarms recent workspaces once they are known, one per idle slot", () => {
		const { store, runScheduled, ids } = setup(["a", "b", "c"]);
		const known = new Set(["a"]);
		store.prewarmRecent((id) => known.has(id));
		runScheduled();
		expect(ids()).toEqual(["a"]);

		known.add("c");
		store.prewarmRecent((id) => known.has(id));
		runScheduled();
		expect(ids()).toEqual(["a", "c"]);
		expect(store.get().every((entry) => !entry.shown)).toBe(true);
	});

	test("forget drops a kept workspace", () => {
		const { store, ids } = setup();
		store.visit("a");
		store.visit("b");
		store.forget("a");

		expect(ids()).toEqual(["b"]);
	});
});
