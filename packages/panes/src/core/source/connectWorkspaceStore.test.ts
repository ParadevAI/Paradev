import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "../../types";
import { createWorkspaceStore } from "../store";
import { connectWorkspaceStore } from "./connectWorkspaceStore";

type Data = { label: string };

function memorySource(initial: WorkspaceState<Data>) {
	let value = initial;
	const listeners = new Set<() => void>();
	let writes = 0;
	return {
		writes: () => writes,
		get: () => value,
		set: (next: WorkspaceState<Data>) => {
			writes++;
			value = structuredClone(next);
			for (const listener of listeners) listener();
		},
		replaceFromElsewhere: (next: WorkspaceState<Data>) => {
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

const EMPTY: WorkspaceState<Data> = { version: 1, tabs: [], activeTabId: null };

describe("connectWorkspaceStore", () => {
	it("loads the source's layout into the store", () => {
		const seeded = createWorkspaceStore<Data>();
		seeded
			.getState()
			.addTab({ id: "t1", panes: [{ kind: "a", data: { label: "a" } }] });
		const { version, tabs, activeTabId } = seeded.getState();
		const source = memorySource({ version, tabs, activeTabId });
		const store = createWorkspaceStore<Data>();

		connectWorkspaceStore(store, source);

		expect(store.getState().tabs.map((tab) => tab.id)).toEqual(["t1"]);
		expect(source.writes()).toBe(0);
	});

	it("writes store actions through to the source once, without echoing back", () => {
		const source = memorySource(EMPTY);
		const store = createWorkspaceStore<Data>();
		connectWorkspaceStore(store, source);

		store
			.getState()
			.addTab({ id: "t1", panes: [{ kind: "a", data: { label: "a" } }] });

		expect(source.writes()).toBe(1);
		expect(source.get().activeTabId).toBe("t1");
		expect(store.getState().tabs).toHaveLength(1);
	});

	it("applies changes made elsewhere and does not write them back", () => {
		const source = memorySource(EMPTY);
		const store = createWorkspaceStore<Data>();
		connectWorkspaceStore(store, source);
		const other = createWorkspaceStore<Data>();
		other
			.getState()
			.addTab({ id: "t2", panes: [{ kind: "b", data: { label: "b" } }] });
		const { version, tabs, activeTabId } = other.getState();

		source.replaceFromElsewhere({ version, tabs, activeTabId });

		expect(store.getState().activeTabId).toBe("t2");
		expect(source.writes()).toBe(0);
	});

	it("stops both directions once disconnected", () => {
		const source = memorySource(EMPTY);
		const store = createWorkspaceStore<Data>();
		const disconnect = connectWorkspaceStore(store, source);
		disconnect();

		store.getState().addTab({ panes: [{ kind: "a", data: { label: "a" } }] });
		source.replaceFromElsewhere(EMPTY);

		expect(source.writes()).toBe(0);
		expect(store.getState().tabs).toHaveLength(1);
	});
});
