import { beforeEach, describe, expect, test } from "bun:test";
import {
	MAX_WINDOW_TABS,
	useWindowTabsStore,
	type WindowTab,
} from "./window-tabs";

const home: WindowTab = { id: "home", kind: "home", href: "/new-workspace" };
const tasks: WindowTab = { id: "tasks", kind: "tasks", href: "/tasks" };
const workspace: WindowTab = {
	id: "workspace:ws-1",
	kind: "workspace",
	href: "/v2-workspace/ws-1",
	workspaceId: "ws-1",
};

const store = () => useWindowTabsStore.getState();

beforeEach(() => {
	useWindowTabsStore.setState({ tabs: [], activeTabId: null });
});

describe("window tabs", () => {
	test("opening appends and activates; reopening updates the href in place", () => {
		store().open(home);
		store().open(tasks);
		store().open({ ...home, href: "/new-workspace?projectId=p1" });

		expect(store().tabs.map((tab) => tab.id)).toEqual(["home", "tasks"]);
		expect(store().tabs[0]?.href).toBe("/new-workspace?projectId=p1");
		expect(store().activeTabId).toBe("home");
	});

	test("the strip is bounded: the oldest tabs close first", () => {
		for (let index = 0; index < MAX_WINDOW_TABS + 2; index += 1) {
			store().open({ id: `tasks-${index}`, kind: "tasks", href: "/tasks" });
		}

		expect(store().tabs).toHaveLength(MAX_WINDOW_TABS);
		expect(store().tabs[0]?.id).toBe("tasks-2");
		expect(store().activeTabId).toBe(`tasks-${MAX_WINDOW_TABS + 1}`);
	});

	test("closing a background tab leaves the active one alone", () => {
		store().open(home);
		store().open(tasks);

		expect(store().close("home")).toEqual({ wasActive: false, next: null });
		expect(store().activeTabId).toBe("tasks");
	});

	test("closing the active tab hands over to the left neighbour, else the right", () => {
		store().open(home);
		store().open(workspace);
		store().open(tasks);
		store().open(workspace);

		expect(store().close(workspace.id)).toEqual({
			wasActive: true,
			next: home,
		});
		expect(store().activeTabId).toBe("home");

		expect(store().close("home")).toEqual({ wasActive: true, next: tasks });
		expect(store().close("tasks")).toEqual({ wasActive: true, next: null });
		expect(store().tabs).toEqual([]);
	});
});
