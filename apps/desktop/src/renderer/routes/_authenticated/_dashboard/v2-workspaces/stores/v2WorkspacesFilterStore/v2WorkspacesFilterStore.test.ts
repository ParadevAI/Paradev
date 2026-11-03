import { afterAll, beforeEach, expect, test } from "bun:test";
import {
	BUILT_IN_VIEW_ALL,
	BUILT_IN_VIEW_CLOUD,
	BUILT_IN_VIEW_NEEDS_ME,
	getViewFilters,
	MAX_SAVED_VIEWS,
	sameViewFilters,
	sanitizeViewFilters,
	useV2WorkspacesFilterStore,
	type V2WorkspacesViewFilters,
	WHERE_FILTER_CLOUD,
} from "./v2WorkspacesFilterStore";

const currentFilters = (): V2WorkspacesViewFilters => {
	const state = useV2WorkspacesFilterStore.getState();
	return {
		whereFilter: state.whereFilter,
		projectFilters: state.projectFilters,
		creatorFilters: state.creatorFilters,
		statusFilters: state.statusFilters,
		showArchived: state.showArchived,
	};
};

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
	expect(state.groupBy).toBe("none");
	expect(state.orderBy).toBe("activity");
	expect(state.activeViewId).toBe(BUILT_IN_VIEW_ALL);
});

test("reset keeps the layout, lands on All and hides archived workspaces", () => {
	useV2WorkspacesFilterStore.setState({
		viewMode: "board",
		showArchived: true,
		projectFilters: ["project-a"],
	});
	useV2WorkspacesFilterStore.getState().applyView(BUILT_IN_VIEW_NEEDS_ME);

	useV2WorkspacesFilterStore.getState().reset();

	const state = useV2WorkspacesFilterStore.getState();
	expect(state.viewMode).toBe("board");
	expect(state.activeViewId).toBe(BUILT_IN_VIEW_ALL);
	expect(state.statusFilters).toEqual([]);
	expect(state.showArchived).toBe(false);
	expect(state.projectFilters).toEqual([]);
});

test("applying a built-in view replaces the filters with its preset", () => {
	useV2WorkspacesFilterStore.setState({ projectFilters: ["project-a"] });

	useV2WorkspacesFilterStore.getState().applyView(BUILT_IN_VIEW_CLOUD);

	const state = useV2WorkspacesFilterStore.getState();
	expect(state.activeViewId).toBe(BUILT_IN_VIEW_CLOUD);
	expect(state.whereFilter).toBe(WHERE_FILTER_CLOUD);
	expect(state.projectFilters).toEqual([]);
});

test("editing filters makes the view dirty; reset puts them back", () => {
	const store = useV2WorkspacesFilterStore;
	store.getState().applyView(BUILT_IN_VIEW_NEEDS_ME);
	const pinned = getViewFilters(BUILT_IN_VIEW_NEEDS_ME, []);
	expect(sameViewFilters(currentFilters(), pinned)).toBe(true);

	store.getState().setCreatorFilters(["user-a"]);
	expect(sameViewFilters(currentFilters(), pinned)).toBe(false);

	store.getState().resetToView();
	expect(sameViewFilters(currentFilters(), pinned)).toBe(true);
});

test("saving as a new view captures the filters and becomes active", () => {
	const store = useV2WorkspacesFilterStore;
	store.getState().setProjectFilters(["project-a"]);
	store.getState().setStatusFilters(["working"]);

	store.getState().saveAsNewView("Alpha, working");

	const state = store.getState();
	expect(state.savedViews).toHaveLength(1);
	expect(state.activeViewId).toBe(state.savedViews[0].id);
	expect(state.savedViews[0].name).toBe("Alpha, working");
	expect(state.savedViews[0].filters.projectFilters).toEqual(["project-a"]);
	expect(state.savedViews[0].filters.statusFilters).toEqual(["working"]);

	store.getState().setProjectFilters([]);
	store.getState().saveView();
	expect(store.getState().savedViews[0].filters.projectFilters).toEqual([]);
});

test("saving a view does not alias the live filter arrays", () => {
	const store = useV2WorkspacesFilterStore;
	store.getState().setProjectFilters(["project-a"]);
	store.getState().saveAsNewView("Alpha");

	store.getState().projectFilters.push("project-b");

	expect(store.getState().savedViews[0].filters.projectFilters).toEqual([
		"project-a",
	]);
});

test("deleting the active view falls back to All", () => {
	const store = useV2WorkspacesFilterStore;
	store.getState().setWhereFilter(WHERE_FILTER_CLOUD);
	store.getState().saveAsNewView("Cloud only");
	const id = store.getState().activeViewId;

	store.getState().deleteView(id);

	const state = store.getState();
	expect(state.savedViews).toEqual([]);
	expect(state.activeViewId).toBe(BUILT_IN_VIEW_ALL);
	expect(state.whereFilter).not.toBe(WHERE_FILTER_CLOUD);
});

test("saved views get unique ids and the cap refuses further saves", () => {
	const store = useV2WorkspacesFilterStore;
	for (let index = 0; index < MAX_SAVED_VIEWS; index += 1) {
		expect(store.getState().saveAsNewView(`View ${index}`)).toBe(true);
	}
	expect(store.getState().saveAsNewView("One too many")).toBe(false);

	const views = store.getState().savedViews;
	expect(views).toHaveLength(MAX_SAVED_VIEWS);
	expect(new Set(views.map((view) => view.id)).size).toBe(MAX_SAVED_VIEWS);
	expect(views.at(-1)?.name).toBe(`View ${MAX_SAVED_VIEWS - 1}`);
});

test("applying an unknown view lands on All", () => {
	const store = useV2WorkspacesFilterStore;
	store.getState().setProjectFilters(["project-a"]);

	store.getState().applyView("view-from-another-machine");

	expect(store.getState().activeViewId).toBe(BUILT_IN_VIEW_ALL);
	expect(store.getState().projectFilters).toEqual([]);
});

test("inherited object names are not views", () => {
	const store = useV2WorkspacesFilterStore;
	expect(getViewFilters("constructor", [])).toEqual(
		getViewFilters(BUILT_IN_VIEW_ALL, []),
	);
	store.getState().applyView("toString");
	expect(store.getState().activeViewId).toBe(BUILT_IN_VIEW_ALL);
	expect(() => store.getState().resetToView()).not.toThrow();
});

test("setActiveViewId switches the tab without touching the filters", () => {
	const store = useV2WorkspacesFilterStore;
	store.getState().setProjectFilters(["project-a"]);
	store.getState().setActiveViewId(BUILT_IN_VIEW_NEEDS_ME);
	expect(store.getState().activeViewId).toBe(BUILT_IN_VIEW_NEEDS_ME);
	expect(store.getState().projectFilters).toEqual(["project-a"]);
});

test("sanitizeViewFilters drops unknown buckets and malformed shapes", () => {
	expect(
		sanitizeViewFilters({
			whereFilter: "",
			projectFilters: ["p1", 7 as unknown as string],
			statusFilters: ["working", "colour" as never],
			showArchived: "yes" as unknown as boolean,
		}),
	).toEqual({
		whereFilter: "anywhere",
		projectFilters: ["p1"],
		creatorFilters: [],
		statusFilters: ["working"],
		showArchived: false,
	});
});
