import { describe, expect, it } from "bun:test";
import {
	orderProjectChildren,
	type ProjectChild,
} from "./orderProjectChildren";

interface Row {
	name: string;
	t: number;
}

const row = (name: string, t: number): Row => ({ name, t });
const folder = (name: string, workspaces: Row[]) => ({
	key: `p:${name}`,
	tag: name,
	name,
	color: null,
	workspaces,
});
const names = (children: ProjectChild<Row>[]) =>
	children.map((child) =>
		child.type === "workspace"
			? child.workspace.name
			: `[${child.folder.name}]`,
	);

const grouped = {
	ungrouped: [row("new", 30), row("old", 10)],
	folders: [folder("bugs", [row("fix", 5)]), folder("feat", [row("busy", 40)])],
};
const order = (sort: "manual" | "active" | "created") =>
	names(orderProjectChildren(grouped, sort, (workspace) => workspace.t));

describe("orderProjectChildren", () => {
	it("manual keeps ungrouped rows, then folders in their order", () => {
		expect(order("manual")).toEqual(["new", "old", "[bugs]", "[feat]"]);
	});

	it("active mixes folders in by their newest row", () => {
		expect(order("active")).toEqual(["[feat]", "new", "old", "[bugs]"]);
	});

	it("created sinks folders below the rows", () => {
		expect(order("created")).toEqual(["new", "old", "[bugs]", "[feat]"]);
	});

	it("ranks a row with no time last", () => {
		const children = orderProjectChildren(
			{ ungrouped: [row("unknown", Number.NaN), row("dated", 1)], folders: [] },
			"active",
			(workspace) => workspace.t,
		);
		expect(names(children)).toEqual(["dated", "unknown"]);
	});
});
