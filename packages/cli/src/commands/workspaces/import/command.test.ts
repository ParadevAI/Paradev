import { afterEach, describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import importCommand from "./command";

type Worktree = {
	branch: string;
	path: string;
	hasWorkspace: boolean;
	isMainWorktree: boolean;
};

const MAIN: Worktree = {
	branch: "main",
	path: "/repo",
	hasWorkspace: true,
	isMainWorktree: true,
};
const TRACKED: Worktree = {
	branch: "tracked",
	path: "/worktrees/tracked",
	hasWorkspace: true,
	isMainWorktree: false,
};
const UNTRACKED_A: Worktree = {
	branch: "feature-a",
	path: "/worktrees/feature-a",
	hasWorkspace: false,
	isMainWorktree: false,
};
const UNTRACKED_B: Worktree = {
	branch: "feature-b",
	path: "/worktrees/feature-b",
	hasWorkspace: false,
	isMainWorktree: false,
};

let worktrees: Worktree[] = [MAIN, TRACKED, UNTRACKED_A, UNTRACKED_B];
let listInput: Record<string, unknown> | undefined;
let createInputs: Record<string, unknown>[] = [];
let createResult: (input: Record<string, unknown>) => unknown = (input) => ({
	workspace: { id: `ws-${input.branch}` },
	alreadyExists: false,
});

withLocalHostService("org-1", {
	"workspaceCreation.listProjectWorktrees": (input) => {
		listInput = input;
		return { worktrees };
	},
	"workspaces.create": (input) => {
		createInputs.push(input);
		return createResult(input);
	},
});

function invoke(options: Record<string, unknown> = {}) {
	return importCommand.run({
		ctx: { api: {}, config: { organizationId: "org-1" }, bearer: "b" } as never,
		args: {} as never,
		options: { local: true, project: "project-1", ...options } as never,
		signal: new AbortController().signal,
	}) as Promise<{ data: Record<string, unknown>; message: string }>;
}

async function invokeError(options: Record<string, unknown>) {
	try {
		await invoke(options);
	} catch (error) {
		if (error instanceof CLIError) return error;
		throw error;
	}
	throw new Error("expected a CLIError");
}

afterEach(() => {
	worktrees = [MAIN, TRACKED, UNTRACKED_A, UNTRACKED_B];
	listInput = undefined;
	createInputs = [];
	createResult = (input) => ({
		workspace: { id: `ws-${input.branch}` },
		alreadyExists: false,
	});
});

describe("workspaces import: arguments", () => {
	test("rejects --all with --path", async () => {
		await expect(
			invoke({ all: true, path: ["/worktrees/feature-a"] }),
		).rejects.toThrow(/Specify only one of --all or --path/);
		expect(listInput).toBeUndefined();
	});

	test("requires --local or --host", async () => {
		await expect(invoke({ local: undefined, all: true })).rejects.toThrow(
			/Target host required/,
		);
	});

	test("rejects --host with --local", async () => {
		await expect(invoke({ host: "other", all: true })).rejects.toThrow(
			/either --host or --local/,
		);
	});
});

describe("workspaces import: flow", () => {
	test("without --all or --path, lists candidates and fails without importing", async () => {
		const error = await invokeError({});
		expect(error.message).toContain("feature-a");
		expect(error.suggestion).toContain("--all");
		expect(error.data).toMatchObject({
			dryRun: true,
			wouldImport: [
				{ branch: "feature-a", path: "/worktrees/feature-a" },
				{ branch: "feature-b", path: "/worktrees/feature-b" },
			],
		});
		expect(listInput).toEqual({ projectId: "project-1" });
		expect(createInputs).toEqual([]);
	});

	test("without a selector and nothing untracked, succeeds", async () => {
		worktrees = [MAIN, TRACKED];
		const result = await invoke({});
		expect(result.data.wouldImport).toEqual([]);
		expect(createInputs).toEqual([]);
	});

	test("--dry-run --all lists without importing", async () => {
		const result = await invoke({ all: true, dryRun: true });
		expect(result.data).toMatchObject({
			dryRun: true,
			wouldImport: [{ branch: "feature-a" }, { branch: "feature-b" }],
			skipped: [{ branch: "tracked", reason: "already a workspace" }],
		});
		expect(createInputs).toEqual([]);
	});

	test("--all adopts each untracked worktree with setup off", async () => {
		const result = await invoke({ all: true });
		expect(createInputs).toEqual([
			{
				projectId: "project-1",
				branch: "feature-a",
				worktreePath: "/worktrees/feature-a",
				runSetup: false,
			},
			{
				projectId: "project-1",
				branch: "feature-b",
				worktreePath: "/worktrees/feature-b",
				runSetup: false,
			},
		]);
		expect(result.data).toEqual({
			imported: [
				{
					branch: "feature-a",
					path: "/worktrees/feature-a",
					workspaceId: "ws-feature-a",
				},
				{
					branch: "feature-b",
					path: "/worktrees/feature-b",
					workspaceId: "ws-feature-b",
				},
			],
			skipped: [
				{
					branch: "tracked",
					path: "/worktrees/tracked",
					reason: "already a workspace",
				},
			],
			failed: [],
		});
	});

	test("--run-setup turns setup on", async () => {
		await invoke({ all: true, runSetup: true });
		expect(createInputs.map((input) => input.runSetup)).toEqual([true, true]);
	});

	test("re-running when everything is imported is a no-op", async () => {
		worktrees = [MAIN, TRACKED];
		const result = await invoke({ all: true });
		expect(createInputs).toEqual([]);
		expect(result.data).toMatchObject({ imported: [], failed: [] });
	});

	test("--path imports only the named worktrees and skips tracked ones", async () => {
		const result = await invoke({
			path: ["/worktrees/feature-b/", "/worktrees/tracked", "/repo"],
		});
		expect(createInputs.map((input) => input.worktreePath)).toEqual([
			"/worktrees/feature-b",
		]);
		expect(result.data).toMatchObject({
			imported: [{ branch: "feature-b", workspaceId: "ws-feature-b" }],
			skipped: [
				{ branch: "tracked", reason: "already a workspace" },
				{ branch: "main", reason: "project's main checkout" },
			],
		});
	});

	test("an unknown --path fails while the others still import", async () => {
		const error = await invokeError({
			path: ["/worktrees/feature-a", "/nowhere"],
		});
		expect(error.message).toContain("/nowhere");
		expect(error.data).toMatchObject({
			imported: [{ branch: "feature-a" }],
			failed: [{ path: "/nowhere" }],
		});
	});

	test("a worktree the host already tracks is reported as skipped", async () => {
		createResult = () => ({
			workspace: { id: "ws-existing" },
			alreadyExists: true,
		});
		const result = await invoke({ path: ["/worktrees/feature-a"] });
		expect(result.data).toMatchObject({
			imported: [],
			skipped: [
				{
					branch: "feature-a",
					reason: "already a workspace",
					workspaceId: "ws-existing",
				},
			],
		});
	});

	test("a host error fails that worktree and exits non-zero", async () => {
		createResult = (input) => {
			if (input.branch === "feature-a") throw new Error("git is locked");
			return { workspace: { id: "ws-b" }, alreadyExists: false };
		};
		const error = await invokeError({ all: true });
		expect(error.data).toMatchObject({
			imported: [{ branch: "feature-b", workspaceId: "ws-b" }],
			failed: [{ branch: "feature-a", reason: "git is locked" }],
		});
	});
});
