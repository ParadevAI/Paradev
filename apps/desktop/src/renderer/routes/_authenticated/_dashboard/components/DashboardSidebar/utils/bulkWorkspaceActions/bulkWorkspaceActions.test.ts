import { describe, expect, it } from "bun:test";
import {
	splitBulkRemovalTargets,
	workspaceIdsForSectionMove,
} from "./bulkWorkspaceActions";

describe("workspaceIdsForSectionMove", () => {
	const sectionByWorkspaceId = new Map([
		["one", "section-a"],
		["two", "section-b"],
	]);

	it("skips workspaces already in the destination group", () => {
		expect(
			workspaceIdsForSectionMove(
				["one", "two", "three"],
				sectionByWorkspaceId,
				"section-a",
			),
		).toEqual(["two", "three"]);
	});

	it("only returns grouped workspaces when ungrouping", () => {
		expect(
			workspaceIdsForSectionMove(
				["one", "two", "three"],
				sectionByWorkspaceId,
				null,
			),
		).toEqual(["one", "two"]);
	});
});

describe("splitBulkRemovalTargets", () => {
	it("archives cloud workspaces and deletes the rest", () => {
		const local = { id: "local", hostType: "local-device" };
		const remote = { id: "remote", hostType: "remote-device" };
		const cloud = { id: "cloud", hostType: "cloud" };

		expect(splitBulkRemovalTargets([local, cloud, remote])).toEqual({
			deletable: [local, remote],
			archivable: [cloud],
		});
	});
});
