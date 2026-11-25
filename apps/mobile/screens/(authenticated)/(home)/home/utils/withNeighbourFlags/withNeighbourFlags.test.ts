import { describe, expect, test } from "bun:test";
import type { HomeListItem } from "../../types";
import { withNeighbourFlags } from "./withNeighbourFlags";

const cloud = (id: string): HomeListItem => ({
	kind: "cloudRow",
	row: { id } as never,
});
const label = (key: string): HomeListItem => ({
	kind: "sectionLabel",
	key,
	label: key,
});
const project = (projectId: string): HomeListItem => ({
	kind: "projectHeader",
	machineId: "m1",
	projectId,
	name: projectId,
	count: 1,
	collapsed: false,
	attention: null,
	offline: false,
});

describe("withNeighbourFlags", () => {
	test("draws under rows, not under headers or the last row before a label", () => {
		const items = withNeighbourFlags([
			label("a"),
			cloud("1"),
			cloud("2"),
			label("b"),
			cloud("3"),
		]);
		expect(
			items.map((item) =>
				item.kind === "cloudRow" ? `${item.row.id}:${item.separator}` : "label",
			),
		).toEqual(["label", "1:true", "2:false", "label", "3:false"]);
	});

	test("tightens a project header only right under a section label", () => {
		const items = withNeighbourFlags([
			label("host"),
			project("p1"),
			cloud("1"),
			project("p2"),
		]);
		expect(
			items.flatMap((item) =>
				item.kind === "projectHeader"
					? [`${item.projectId}:${item.afterLabel}`]
					: [],
			),
		).toEqual(["p1:true", "p2:false"]);
	});
});
