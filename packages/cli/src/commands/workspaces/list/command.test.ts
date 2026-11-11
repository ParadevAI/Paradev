import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import { workspaceLinks } from "../../../lib/open-url";
import listCommand from "./command";

const HOST_WORKSPACE_ID = "b502bf30-8693-4815-be65-795035e0ce5f";
const CLOUD_WORKSPACE_ID = "6f1c2a52-9f4e-4d55-9a0c-2a5f3c1b7d10";
const PROJECT_ID = "proj-1";

const HOST_WORKSPACE = {
	id: HOST_WORKSPACE_ID,
	name: "ludicrous-candytuft",
	branch: "setup",
	projectId: PROJECT_ID,
	projectName: "Paradev",
	tags: [],
};

let hostWorkspaces: Array<Record<string, unknown>> = [HOST_WORKSPACE];
let tagSettings: Array<Record<string, unknown>> = [];

withLocalHostService("org-1", {
	"workspace.list": () => hostWorkspaces,
	"tagFolders.list": () => tagSettings,
});

function invoke(options: Record<string, unknown>) {
	return listCommand.run({
		ctx: {
			api: {
				cloudWorkspace: {
					available: { query: async () => ({ available: true }) },
					list: {
						query: async () => [
							{
								id: CLOUD_WORKSPACE_ID,
								name: "cloud-one",
								branch: "main",
								status: "ready",
							},
						],
					},
				},
			},
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: options as never,
		signal: new AbortController().signal,
	}) as Promise<Array<Record<string, unknown>>>;
}

function withGroupedWorkspaces() {
	hostWorkspaces = [
		{ ...HOST_WORKSPACE, id: "ws-1", tags: ["new group"] },
		{ ...HOST_WORKSPACE, id: "ws-2", tags: ["bugs"] },
		{ ...HOST_WORKSPACE, id: "ws-3", tags: [] },
	];
	tagSettings = [{ scope: PROJECT_ID, tag: "new group", displayName: "Sales" }];
}

afterEach(() => {
	hostWorkspaces = [HOST_WORKSPACE];
	tagSettings = [];
});

describe("workspaces list", () => {
	test("each host workspace carries its desktop and web links", async () => {
		const [row] = await invoke({ local: true });
		expect(row).toMatchObject({
			id: HOST_WORKSPACE_ID,
			...workspaceLinks(HOST_WORKSPACE_ID),
		});
	});

	test("each cloud workspace carries its desktop and web links", async () => {
		const [row] = await invoke({});
		expect(row).toMatchObject({
			id: CLOUD_WORKSPACE_ID,
			status: "ready",
			...workspaceLinks(CLOUD_WORKSPACE_ID),
		});
	});

	test("shows each workspace's group by the name the desktop shows", async () => {
		withGroupedWorkspaces();
		const rows = await invoke({ local: true });
		expect(rows.map(({ id, group }) => [id, group])).toEqual([
			["ws-1", "Sales"],
			["ws-2", "bugs"],
			["ws-3", ""],
		]);
	});

	test("--group filters by the shown name, case-insensitively", async () => {
		withGroupedWorkspaces();
		const rows = await invoke({ local: true, group: "sales" });
		expect(rows.map((row) => row.id)).toEqual(["ws-1"]);
	});
});
