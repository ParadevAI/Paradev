import { describe, expect, it } from "bun:test";
import { collectPendingPlacementProjectIds } from "./collectPendingPlacementProjectIds";

const placementContext = {
	machineId: "this-machine",
	onlineHostIds: new Set<string>(),
	currentUserId: "me",
};

function hostWorkspace(id: string, projectId: string, hostId = "this-machine") {
	return {
		id,
		projectId,
		type: "worktree" as const,
		hostId,
		hostReachable: true,
		createdByUserId: "me",
	};
}

describe("collectPendingPlacementProjectIds", () => {
	it("lists the project of a host workspace that is not placed yet", () => {
		const pending = collectPendingPlacementProjectIds({
			hostWorkspaces: [
				hostWorkspace("w-new", "p-new"),
				hostWorkspace("w-old", "p-old"),
			],
			cloudRows: [],
			placedProjectIdByWorkspaceId: new Map([["w-old", "p-old"]]),
			placementContext,
		});
		expect([...pending]).toEqual(["p-new"]);
	});

	it("skips host workspaces that placement will not add", () => {
		const pending = collectPendingPlacementProjectIds({
			hostWorkspaces: [hostWorkspace("w-offline", "p-remote", "offline-host")],
			cloudRows: [],
			placedProjectIdByWorkspaceId: new Map(),
			placementContext,
		});
		expect(pending.size).toBe(0);
	});

	it("lists the project of a cloud row that is unplaced or filed elsewhere", () => {
		const pending = collectPendingPlacementProjectIds({
			hostWorkspaces: [],
			cloudRows: [
				{ id: "c-new", projectId: "p-a" },
				{ id: "c-moved", projectId: "p-b" },
				{ id: "c-settled", projectId: "p-c" },
			],
			placedProjectIdByWorkspaceId: new Map([
				["c-moved", "stand-in"],
				["c-settled", "p-c"],
			]),
			placementContext,
		});
		expect([...pending].sort()).toEqual(["p-a", "p-b"]);
	});
});
