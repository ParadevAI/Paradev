import { describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import listCommand from "./command";

let listInput: Record<string, unknown> | undefined;

withLocalHostService("org-1", {
	"workspaceCreation.listProjectWorktrees": (input) => {
		listInput = input;
		return {
			worktrees: [
				{
					branch: "main",
					path: "/repo",
					hasWorkspace: true,
					workspaceId: "ws-main",
					isMainWorktree: true,
				},
				{
					branch: "feature",
					path: "/worktrees/feature",
					hasWorkspace: false,
					workspaceId: null,
					isMainWorktree: false,
				},
				{
					branch: "old-host",
					path: "/worktrees/old-host",
					hasWorkspace: true,
					isMainWorktree: false,
				},
			],
		};
	},
});

function invoke(options: Record<string, unknown> = {}) {
	return listCommand.run({
		ctx: { api: {}, config: { organizationId: "org-1" }, bearer: "b" } as never,
		args: {} as never,
		options: { project: "project-1", ...options } as never,
		signal: new AbortController().signal,
	});
}

describe("worktrees list", () => {
	test("lists every worktree with the workspace that tracks it", async () => {
		expect(await invoke()).toEqual([
			{
				branch: "main",
				path: "/repo",
				isMain: true,
				hasWorkspace: true,
				workspaceId: "ws-main",
			},
			{
				branch: "feature",
				path: "/worktrees/feature",
				isMain: false,
				hasWorkspace: false,
				workspaceId: null,
			},
			{
				branch: "old-host",
				path: "/worktrees/old-host",
				isMain: false,
				hasWorkspace: true,
				workspaceId: null,
			},
		]);
		expect(listInput).toEqual({ projectId: "project-1" });
	});

	test("rejects --host with --local", async () => {
		await expect(invoke({ host: "other", local: true })).rejects.toThrow(
			/either --host or --local/,
		);
	});
});
