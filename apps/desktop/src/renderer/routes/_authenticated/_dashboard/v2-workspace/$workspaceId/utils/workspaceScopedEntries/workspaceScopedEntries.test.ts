import { describe, expect, it } from "bun:test";
import {
	emptyWorkspaceScopedEntries,
	entriesForWorkspace,
	setWorkspaceScopedEntry,
} from "./workspaceScopedEntries";

describe("workspaceScopedEntries", () => {
	it("hides another workspace's entries before the new workspace reports", () => {
		const state = setWorkspaceScopedEntry(
			emptyWorkspaceScopedEntries<string>(),
			"ws-a",
			"repo-1",
			"a-status",
		);
		expect(entriesForWorkspace(state, "ws-a")).toEqual({
			"repo-1": "a-status",
		});
		expect(entriesForWorkspace(state, "ws-b")).toEqual({});
	});

	it("drops the old workspace's entries on the first write for a new one", () => {
		let state = emptyWorkspaceScopedEntries<string>();
		state = setWorkspaceScopedEntry(state, "ws-a", "repo-1", "a1");
		state = setWorkspaceScopedEntry(state, "ws-a", "repo-2", "a2");
		state = setWorkspaceScopedEntry(state, "ws-b", "repo-1", "b1");
		expect(entriesForWorkspace(state, "ws-b")).toEqual({ "repo-1": "b1" });
	});

	it("keeps the same state object when the value did not change", () => {
		const state = setWorkspaceScopedEntry(
			emptyWorkspaceScopedEntries<string>(),
			"ws-a",
			"repo-1",
			"a1",
		);
		expect(setWorkspaceScopedEntry(state, "ws-a", "repo-1", "a1")).toBe(state);
	});
});
