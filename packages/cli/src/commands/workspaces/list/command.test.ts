import { describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import { workspaceLinks } from "../../../lib/open-url";
import listCommand from "./command";

const HOST_WORKSPACE_ID = "b502bf30-8693-4815-be65-795035e0ce5f";
const CLOUD_WORKSPACE_ID = "6f1c2a52-9f4e-4d55-9a0c-2a5f3c1b7d10";

withLocalHostService("org-1", {
	"workspace.list": () => [
		{
			id: HOST_WORKSPACE_ID,
			name: "ludicrous-candytuft",
			branch: "setup",
			projectId: "proj-1",
			projectName: "Paradev",
			tags: [],
		},
	],
});

function invoke(options: { local?: boolean }) {
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
});
