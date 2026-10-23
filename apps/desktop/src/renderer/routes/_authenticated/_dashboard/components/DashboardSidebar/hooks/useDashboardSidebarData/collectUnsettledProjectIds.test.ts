import { describe, expect, it } from "bun:test";
import { filterEmptyDashboardSidebarProjects } from "../../utils/filterEmptyDashboardSidebarProjects";
import { makeProject } from "../../utils/testProjectFixtures";
import { collectUnsettledProjectIds } from "./collectUnsettledProjectIds";

const placementContext = {
	machineId: "this-machine",
	onlineHostIds: new Set(["remote-host"]),
	currentUserId: "me",
};

function hostWorkspace(
	id: string,
	projectId: string,
	{ hostId = "this-machine", hostReachable = true } = {},
) {
	return {
		id,
		projectId,
		type: "worktree" as const,
		hostId,
		hostReachable,
		createdByUserId: "me",
	};
}

function placed(workspaceId: string, projectId: string, isHidden = false) {
	return { workspaceId, projectId, isHidden };
}

const settled = {
	hostWorkspaces: [],
	cloudRows: [],
	knownWorkspaceIds: new Set<string>(),
	placements: [],
	allHostsLive: true,
	placementContext,
};

describe("collectUnsettledProjectIds", () => {
	it("lists the project of a host workspace that is not placed yet", () => {
		const pending = collectUnsettledProjectIds({
			...settled,
			hostWorkspaces: [
				hostWorkspace("w-new", "p-new"),
				hostWorkspace("w-old", "p-old"),
			],
			knownWorkspaceIds: new Set(["w-new", "w-old"]),
			placements: [placed("w-old", "p-old")],
		});
		expect([...pending]).toEqual(["p-new"]);
	});

	it("skips host workspaces that placement will not add", () => {
		const pending = collectUnsettledProjectIds({
			...settled,
			hostWorkspaces: [
				hostWorkspace("w-offline", "p-remote", { hostId: "offline-host" }),
			],
			knownWorkspaceIds: new Set(["w-offline"]),
		});
		expect(pending.size).toBe(0);
	});

	it("lists the project of a cloud row that is unplaced or filed elsewhere", () => {
		const pending = collectUnsettledProjectIds({
			...settled,
			cloudRows: [
				{ id: "c-new", projectId: "p-a" },
				{ id: "c-moved", projectId: "p-b" },
				{ id: "c-settled", projectId: "p-c" },
			],
			knownWorkspaceIds: new Set(["c-new", "c-moved", "c-settled"]),
			placements: [placed("c-moved", "stand-in"), placed("c-settled", "p-c")],
		});
		expect([...pending].sort()).toEqual(["p-a", "p-b"]);
	});

	it("drops a stale placement row once every host answered live", () => {
		const pending = collectUnsettledProjectIds({
			...settled,
			placements: [placed("w-archived", "p-stale")],
		});
		expect(pending.size).toBe(0);
	});

	it("ignores hidden placement rows", () => {
		const pending = collectUnsettledProjectIds({
			...settled,
			allHostsLive: false,
			placements: [placed("w-hidden", "p-hidden", true)],
		});
		expect(pending.size).toBe(0);
	});
});

describe("a project whose workspaces are unknown stays visible", () => {
	const project = makeProject({ id: "p-remote", name: "Remote" });

	function isShown(
		input: Partial<Parameters<typeof collectUnsettledProjectIds>[0]>,
	) {
		const unsettled = collectUnsettledProjectIds({ ...settled, ...input });
		return (
			filterEmptyDashboardSidebarProjects([project], {
				pinnedWorkspaces: [],
				unsettledProjectIds: [...unsettled],
				isReady: true,
			}).hiddenCount === 0
		);
	}

	it("when the host that serves its workspace failed to answer", () => {
		expect(
			isShown({
				allHostsLive: false,
				hostWorkspaces: [hostWorkspace("w-local", "p-other")],
				knownWorkspaceIds: new Set(["w-local"]),
				placements: [
					placed("w-local", "p-other"),
					placed("w-remote", "p-remote"),
				],
			}),
		).toBe(true);
	});

	it("when that host is offline and has no snapshot", () => {
		expect(
			isShown({
				allHostsLive: false,
				placements: [placed("w-remote", "p-remote")],
			}),
		).toBe(true);
	});

	it("when that host's snapshot predates the workspace", () => {
		expect(
			isShown({
				allHostsLive: false,
				hostWorkspaces: [
					hostWorkspace("w-older", "p-remote", {
						hostId: "remote-host",
						hostReachable: false,
					}),
				],
				knownWorkspaceIds: new Set(["w-older"]),
				placements: [
					placed("w-older", "p-remote", true),
					placed("w-newer", "p-remote"),
				],
			}),
		).toBe(true);
	});

	it("when it has a placement row no source resolves yet", () => {
		expect(
			isShown({
				allHostsLive: false,
				placements: [placed("w-unresolved", "p-remote")],
			}),
		).toBe(true);
	});
});
