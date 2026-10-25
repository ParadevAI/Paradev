import { afterAll, beforeEach, expect, test } from "bun:test";
import { useV2WorkspacesFilterStore } from "./v2WorkspacesFilterStore";

function resetStore() {
	useV2WorkspacesFilterStore.setState(
		useV2WorkspacesFilterStore.getInitialState(),
		true,
	);
}

beforeEach(resetStore);
afterAll(resetStore);

test("defaults workspaces to the list with archived workspaces hidden", () => {
	const state = useV2WorkspacesFilterStore.getState();

	expect(state.viewMode).toBe("list");
	expect(state.showArchived).toBe(false);
});

test("reset preserves the chosen view and hides archived workspaces", () => {
	useV2WorkspacesFilterStore.setState({
		viewMode: "board",
		showArchived: true,
		projectFilters: ["project-a"],
	});

	useV2WorkspacesFilterStore.getState().reset();

	const state = useV2WorkspacesFilterStore.getState();
	expect(state.viewMode).toBe("board");
	expect(state.showArchived).toBe(false);
	expect(state.projectFilters).toEqual([]);
});
