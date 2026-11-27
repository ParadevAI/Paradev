import { describe, expect, it } from "bun:test";
import {
	buildBulkWorkspaceInspectionSummary,
	executeBulkWorkspaceDeleteTargets,
} from "./bulkWorkspaceDelete";

const workspaces = [
	{ id: "clean", name: "Clean", branch: "clean" },
	{ id: "dirty", name: "Dirty", branch: "dirty" },
	{ id: "offline", name: "Offline", branch: "offline" },
	{ id: "main", name: "Main", branch: "main" },
];

describe("buildBulkWorkspaceInspectionSummary", () => {
	it.each([
		[true, true, 0],
		[true, false, 1],
		[false, false, 2],
	] as const)("counts shared checkout selections %s / %s as %s worktrees", (first, second, expected) => {
		const targets = workspaces.slice(0, 2);
		const summary = buildBulkWorkspaceInspectionSummary(
			targets,
			new Map(
				targets.map((workspace, index) => [
					workspace.id,
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: false,
							hasUnpushedCommits: false,
							sharesProjectCheckout: index === 0 ? first : second,
						},
					},
				]),
			),
		);
		expect(summary.worktreeCount).toBe(expected);
		expect(summary.canConfirm).toBeTrue();
	});

	it("annotates risk and blocks confirmation only on hard blockers", () => {
		const summary = buildBulkWorkspaceInspectionSummary(
			workspaces,
			new Map([
				[
					"clean",
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: false,
							hasUnpushedCommits: false,
						},
					},
				],
				[
					"dirty",
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: true,
							hasUnpushedCommits: true,
						},
					},
				],
				["offline", { status: "error" as const }],
				[
					"main",
					{
						status: "ready" as const,
						preview: {
							canDelete: false as const,
							reason: "Main workspaces cannot be deleted",
							hasChanges: false as const,
							hasUnpushedCommits: false as const,
						},
					},
				],
			]),
		);

		// The main-workspace blocker gates confirmation; the failed check
		// ("offline") does not — it flips the copy to "Delete without checking".
		expect(summary.canConfirm).toBeFalse();
		expect(summary.changedCount).toBe(1);
		expect(summary.unpushedCount).toBe(1);
		expect(summary.errorCount).toBe(1);
		expect(summary.uncheckedCount).toBe(1);
		expect(summary.blocked).toEqual([
			{
				workspaceId: "main",
				workspaceName: "Main",
				reason: "Main workspaces cannot be deleted",
			},
		]);
		expect(
			summary.items.find((item) => item.workspaceId === "dirty"),
		).toMatchObject({
			status: "ready",
			hasChanges: true,
			hasUnpushedCommits: true,
		});
	});

	it("keeps confirmation enabled while checks are pending or failed", () => {
		const summary = buildBulkWorkspaceInspectionSummary(
			workspaces.slice(0, 3),
			new Map([
				["clean", { status: "loading" as const }],
				["offline", { status: "error" as const }],
			]),
		);

		expect(summary.canConfirm).toBeTrue();
		expect(summary.loadingCount).toBe(2);
		expect(summary.errorCount).toBe(1);
		expect(summary.uncheckedCount).toBe(3);
		expect(summary.worktreeCount).toBe(3);
	});

	it("enables confirmation when every target has a ready deletable preview", () => {
		const summary = buildBulkWorkspaceInspectionSummary(
			workspaces.slice(0, 2),
			new Map([
				[
					"clean",
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: false,
							hasUnpushedCommits: false,
						},
					},
				],
				[
					"dirty",
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: true,
							hasUnpushedCommits: false,
						},
					},
				],
			]),
		);

		expect(summary.canConfirm).toBeTrue();
		expect(summary.loadingCount).toBe(0);
	});
});

describe("executeBulkWorkspaceDeleteTargets", () => {
	function controlledDestroy() {
		const releases = new Map<string, (failure?: Error) => void>();
		let active = 0;
		let maxActive = 0;
		const destroy = async (workspace: string) => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			const failure = await new Promise<Error | undefined>((resolve) =>
				releases.set(workspace, resolve),
			);
			active -= 1;
			if (failure) throw failure;
			return `${workspace}-deleted`;
		};
		const flush = async () => {
			for (let i = 0; i < 10; i += 1) await Promise.resolve();
		};
		return { releases, destroy, flush, maxActive: () => maxActive };
	}

	it("starts every destroy at once", async () => {
		const control = controlledDestroy();

		const run = executeBulkWorkspaceDeleteTargets<string, string, Error>({
			targets: ["a", "b", "c"],
			shouldForce: () => false,
			destroy: control.destroy,
		});

		await control.flush();
		expect([...control.releases.keys()]).toEqual(["a", "b", "c"]);
		for (const release of control.releases.values()) release();
		await run;
		expect(control.maxActive()).toBe(3);
	});

	it("runs oneAtATime targets in line while the others start at once", async () => {
		const control = controlledDestroy();

		const run = executeBulkWorkspaceDeleteTargets<string, string, Error>({
			targets: ["relay-1", "local", "relay-2"],
			oneAtATime: (workspace) => workspace.startsWith("relay"),
			shouldForce: () => false,
			destroy: control.destroy,
		});

		await control.flush();
		expect([...control.releases.keys()].sort()).toEqual(["local", "relay-1"]);
		control.releases.get("relay-1")?.();
		await control.flush();
		expect(control.releases.has("relay-2")).toBeTrue();
		control.releases.get("local")?.();
		control.releases.get("relay-2")?.();
		const result = await run;
		expect(result.successes.map(({ workspace }) => workspace)).toEqual([
			"relay-1",
			"local",
			"relay-2",
		]);
	});

	it("reports whether each settled target was deleted", async () => {
		const settled: boolean[] = [];

		await executeBulkWorkspaceDeleteTargets<string, string, Error>({
			targets: ["fails", "deleted"],
			shouldForce: () => false,
			destroy: async (workspace) => {
				if (workspace === "fails") throw new Error("teardown failed");
				return workspace;
			},
			onSettled: (deleted) => settled.push(deleted),
		});

		expect(settled.sort()).toEqual([false, true]);
	});

	it("reports outcomes in target order when destroys finish out of order", async () => {
		const control = controlledDestroy();
		const failure = new Error("teardown failed");

		const run = executeBulkWorkspaceDeleteTargets<string, string, Error>({
			targets: ["a", "b", "c", "d"],
			shouldForce: () => false,
			destroy: control.destroy,
		});

		await control.flush();
		control.releases.get("d")?.();
		control.releases.get("c")?.(failure);
		control.releases.get("b")?.();
		control.releases.get("a")?.(failure);
		const result = await run;

		expect(result.successes.map(({ workspace }) => workspace)).toEqual([
			"b",
			"d",
		]);
		expect(result.failures).toEqual([
			{ workspace: "a", error: failure },
			{ workspace: "c", error: failure },
		]);
	});

	it("passes each target's own force choice", async () => {
		const calls: Array<{ workspace: string; force: boolean }> = [];

		await executeBulkWorkspaceDeleteTargets<string, string, Error>({
			targets: ["clean", "dirty"],
			shouldForce: (workspace) => workspace === "dirty",
			destroy: async (workspace, force) => {
				calls.push({ workspace, force });
				return workspace;
			},
		});

		expect(calls).toEqual([
			{ workspace: "clean", force: false },
			{ workspace: "dirty", force: true },
		]);
	});

	it("retains failures without force-retrying a clean-to-dirty race", async () => {
		const callCount = new Map<string, number>();
		const conflict = new Error("Worktree became dirty");

		const result = await executeBulkWorkspaceDeleteTargets<
			string,
			string,
			Error
		>({
			targets: ["clean", "raced", "later"],
			shouldForce: () => false,
			destroy: async (workspace) => {
				callCount.set(workspace, (callCount.get(workspace) ?? 0) + 1);
				if (workspace === "raced") throw conflict;
				return `${workspace}-deleted`;
			},
		});

		expect(callCount.get("raced")).toBe(1);
		expect(result.successes.map(({ workspace }) => workspace)).toEqual([
			"clean",
			"later",
		]);
		expect(result.failures).toEqual([{ workspace: "raced", error: conflict }]);
	});

	it("force-retries once when shouldRetryWithForce accepts the failure", async () => {
		const calls: Array<{ workspace: string; force: boolean }> = [];
		const conflict = new Error("Worktree has uncommitted changes");

		const result = await executeBulkWorkspaceDeleteTargets<
			string,
			string,
			Error
		>({
			targets: ["unchecked", "clean"],
			shouldForce: () => false,
			shouldRetryWithForce: (workspace, error) =>
				workspace === "unchecked" && error === conflict,
			destroy: async (workspace, force) => {
				calls.push({ workspace, force });
				if (workspace === "unchecked" && !force) throw conflict;
				return `${workspace}-deleted`;
			},
		});

		expect(calls.filter((call) => call.workspace === "unchecked")).toEqual([
			{ workspace: "unchecked", force: false },
			{ workspace: "unchecked", force: true },
		]);
		expect(calls.filter((call) => call.workspace === "clean")).toEqual([
			{ workspace: "clean", force: false },
		]);
		expect(result.successes.map(({ workspace }) => workspace)).toEqual([
			"unchecked",
			"clean",
		]);
		expect(result.failures).toEqual([]);
	});

	it("does not retry an already-forced destroy", async () => {
		const calls: Array<{ workspace: string; force: boolean }> = [];
		const failure = new Error("still failing");

		const result = await executeBulkWorkspaceDeleteTargets<
			string,
			string,
			Error
		>({
			targets: ["ws"],
			shouldForce: () => true,
			shouldRetryWithForce: () => true,
			destroy: async (workspace, force) => {
				calls.push({ workspace, force });
				throw failure;
			},
		});

		expect(calls).toEqual([{ workspace: "ws", force: true }]);
		expect(result.failures).toEqual([{ workspace: "ws", error: failure }]);
	});
});
