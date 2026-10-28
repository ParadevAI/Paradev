import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import listCommand from "./command";

const PROJECT_ID = "proj-1";

let tagSettings: Array<Record<string, unknown>> = [];

withLocalHostService("org-1", {
	"workspace.list": () => [
		{
			id: "ws-1",
			name: "one",
			branch: "one",
			projectId: PROJECT_ID,
			tags: ["new group"],
		},
		{
			id: "ws-2",
			name: "two",
			branch: "two",
			projectId: PROJECT_ID,
			tags: ["bugs"],
		},
		{
			id: "ws-3",
			name: "three",
			branch: "three",
			projectId: PROJECT_ID,
			tags: [],
		},
	],
	"tagFolders.list": () => tagSettings,
});

async function invoke(options: Record<string, unknown> = {}) {
	return (await listCommand.run({
		ctx: {
			api: {},
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: { local: true, ...options } as never,
		signal: new AbortController().signal,
	})) as Array<{ id: string; group: string }>;
}

afterEach(() => {
	tagSettings = [];
});

describe("workspaces list", () => {
	test("shows each workspace's group by the name the desktop shows", async () => {
		tagSettings = [
			{ scope: PROJECT_ID, tag: "new group", displayName: "Sales" },
		];
		const rows = await invoke();
		expect(rows.map(({ id, group }) => [id, group])).toEqual([
			["ws-1", "Sales"],
			["ws-2", "bugs"],
			["ws-3", ""],
		]);
	});

	test("--group filters by the shown name, case-insensitively", async () => {
		tagSettings = [
			{ scope: PROJECT_ID, tag: "new group", displayName: "Sales" },
		];
		const rows = await invoke({ group: "sales" });
		expect(rows.map((row) => row.id)).toEqual(["ws-1"]);
	});
});
