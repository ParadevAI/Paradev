import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import { workspaceLinks } from "../../../lib/open-url";
import openCommand from "./command";

let createInput: Record<string, unknown> | undefined;
let alreadyExists = false;

withLocalHostService("org-1", {
	"workspaceCreation.listProjectWorktrees": () => ({
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
		],
	}),
	"workspaces.create": (input) => {
		createInput = input;
		return {
			workspace: { id: "ws-feature", name: "feature" },
			alreadyExists,
		};
	},
});

function invoke(options: Record<string, unknown>) {
	return openCommand.run({
		ctx: { api: {}, config: { organizationId: "org-1" }, bearer: "b" } as never,
		args: {} as never,
		options: { project: "project-1", ...options } as never,
		signal: new AbortController().signal,
	}) as Promise<{ data: Record<string, unknown>; message: string }>;
}

afterEach(() => {
	createInput = undefined;
	alreadyExists = false;
});

describe("worktrees open: arguments", () => {
	for (const options of [
		{},
		{ path: "/worktrees/feature", branch: "feature" },
	]) {
		test(`requires exactly one of --path or --branch (${Object.keys(options).join(",") || "none"})`, async () => {
			await expect(invoke(options)).rejects.toThrow(
				/exactly one of --path or --branch/,
			);
			expect(createInput).toBeUndefined();
		});
	}

	test("rejects a relative --path on another host", async () => {
		await expect(
			invoke({ host: "other-host", path: "worktrees/feature" }),
		).rejects.toThrow(/must be absolute on another host/);
	});
});

describe("worktrees open", () => {
	test("adopts the worktree at --path with setup off", async () => {
		const result = await invoke({ path: "/worktrees/feature/" });
		expect(createInput).toEqual({
			projectId: "project-1",
			branch: "feature",
			worktreePath: "/worktrees/feature",
			runSetup: false,
		});
		expect(result.data).toEqual({
			workspace: { id: "ws-feature", name: "feature" },
			worktree: { branch: "feature", path: "/worktrees/feature" },
			alreadyExists: false,
			...workspaceLinks("ws-feature"),
		});
		expect(result.message).toStartWith("Opened worktree feature");
	});

	test("finds the worktree by --branch and forwards --run-setup", async () => {
		await invoke({ branch: "feature", runSetup: true });
		expect(createInput).toMatchObject({
			worktreePath: "/worktrees/feature",
			runSetup: true,
		});
	});

	test("reports the workspace that already tracks the worktree", async () => {
		alreadyExists = true;
		const result = await invoke({ branch: "feature" });
		expect(result.data.alreadyExists).toBe(true);
		expect(result.message).toStartWith("Worktree feature is already workspace");
	});

	test("rejects a path that is not a worktree of the project", async () => {
		await expect(invoke({ path: "/nowhere" })).rejects.toThrow(
			/No worktree of this project at \/nowhere/,
		);
		expect(createInput).toBeUndefined();
	});

	test("rejects the project's main checkout", async () => {
		await expect(invoke({ branch: "main" })).rejects.toThrow(/main checkout/);
		expect(createInput).toBeUndefined();
	});
});
