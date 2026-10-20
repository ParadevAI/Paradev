import { describe, expect, it } from "bun:test";
import {
	makeProject,
	makeSection,
	makeWorkspace,
} from "../../utils/testProjectFixtures";
import {
	applyCloudSidebarPinnedRows,
	applyCloudSidebarRows,
} from "./applyCloudSidebarRows";

const builtCloud = makeWorkspace({
	id: "c1",
	name: "c1",
	hostType: "remote-device",
	hostIsOnline: false,
	isPinned: true,
});
const cloudRow = makeWorkspace({
	id: "c1",
	name: "Sandbox",
	hostType: "cloud",
	hostIsOnline: null,
	isMine: true,
	projectId: "stale",
});
const local = makeWorkspace({ id: "w1", name: "fix-login" });
const cloudRowById = new Map([["c1", cloudRow]]);

describe("applyCloudSidebarRows", () => {
	it("swaps the cloud row in, keeping the builder's placement fields", () => {
		const section = makeSection({
			id: "s1",
			name: "Backend",
			workspaces: [builtCloud],
		});
		const [project] = applyCloudSidebarRows(
			[
				makeProject({
					id: "p1",
					name: "P",
					children: [
						{ type: "workspace", workspace: local },
						{ type: "section", section },
					],
				}),
			],
			cloudRowById,
			new Set(),
		);
		expect(project?.children[0]).toEqual({
			type: "workspace",
			workspace: local,
		});
		const placed = project?.children[1];
		if (placed?.type !== "section") throw new Error("expected a section");
		expect(placed.section.workspaces[0]).toEqual({
			...cloudRow,
			projectId: builtCloud.projectId,
			isPinned: true,
			pendingTransaction: null,
		});
		expect(project?.kind).toBeUndefined();
	});

	it("marks stand-in projects and leaves untouched projects by reference", () => {
		const standIn = makeProject({ id: "repo", name: "docs", children: [] });
		const plain = makeProject({
			id: "p1",
			name: "P",
			children: [{ type: "workspace", workspace: local }],
		});
		const result = applyCloudSidebarRows(
			[standIn, plain],
			cloudRowById,
			new Set(["repo"]),
		);
		expect(result[0]?.kind).toBe("cloud-repo");
		expect(result[1]).toBe(plain);
	});

	it("decorates pinned rows the same way, keeping the project identity", () => {
		const [pinned] = applyCloudSidebarPinnedRows(
			[{ ...builtCloud, projectName: "Superset", projectIconUrl: null }],
			cloudRowById,
		);
		expect(pinned?.hostType).toBe("cloud");
		expect(pinned?.isPinned).toBe(true);
		expect(pinned?.projectName).toBe("Superset");
	});
});
