import { describe, expect, test } from "bun:test";
import type { LayoutNode, Pane, Tab } from "@superset/panes";
import { orderTabPanes } from "./orderTabPanes";

const pane = (id: string): Pane<null> => ({ id, kind: "terminal", data: null });
const leaf = (paneId: string): LayoutNode => ({ type: "pane", paneId });
const split = (first: LayoutNode, second: LayoutNode): LayoutNode => ({
	type: "split",
	direction: "horizontal",
	first,
	second,
});

const tab = (layout: LayoutNode, activePaneId: string | null): Tab<null> => ({
	id: "tab",
	createdAt: 0,
	activePaneId,
	layout,
	panes: Object.fromEntries(
		["a", "b", "c"].map((id) => [id, pane(id)] as const),
	),
});

describe("orderTabPanes", () => {
	const layout = split(leaf("a"), split(leaf("b"), leaf("c")));

	test("puts the focused pane first and keeps the rest in layout order", () => {
		expect(orderTabPanes(tab(layout, "b")).map((p) => p.id)).toEqual([
			"b",
			"a",
			"c",
		]);
	});

	test("uses layout order when no pane is focused", () => {
		expect(orderTabPanes(tab(layout, null)).map((p) => p.id)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	test("skips layout entries with no pane", () => {
		expect(
			orderTabPanes(tab(split(leaf("a"), leaf("gone")), "a")).map((p) => p.id),
		).toEqual(["a"]);
	});
});
