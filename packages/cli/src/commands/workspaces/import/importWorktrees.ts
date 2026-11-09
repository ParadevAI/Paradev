import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { rawErrorMessage } from "@superset/i18n/errors";
import type { HostServiceClient } from "../../../lib/host-target";

type ImportClient = {
	workspaceCreation: {
		listProjectWorktrees: Pick<
			HostServiceClient["workspaceCreation"]["listProjectWorktrees"],
			"query"
		>;
	};
	workspaces: {
		create: Pick<HostServiceClient["workspaces"]["create"], "mutate">;
	};
};

export type WorktreeRef = { branch: string; path: string };

export type ImportReport = {
	imported: (WorktreeRef & { workspaceId: string })[];
	skipped: (WorktreeRef & { reason: string; workspaceId?: string })[];
	failed: { branch?: string; path: string; reason: string }[];
};

export type ImportPlan = {
	candidates: WorktreeRef[];
	skipped: ImportReport["skipped"];
	failed: ImportReport["failed"];
};

/** Normalize a path the way git reports it; only realpath on this machine. */
export function normalizePath(path: string, onThisMachine: boolean): string {
	const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
	if (!onThisMachine) return trimmed;
	const absolute = resolve(trimmed);
	try {
		return realpathSync(absolute);
	} catch {
		return absolute;
	}
}

export async function planWorktreeImport(
	client: ImportClient,
	args: {
		projectId: string;
		paths: string[] | undefined;
		onThisMachine: boolean;
	},
): Promise<ImportPlan> {
	const { worktrees } =
		await client.workspaceCreation.listProjectWorktrees.query({
			projectId: args.projectId,
		});
	const plan: ImportPlan = { candidates: [], skipped: [], failed: [] };
	const classify = (worktree: (typeof worktrees)[number]) => {
		const ref = { branch: worktree.branch, path: worktree.path };
		if (worktree.isMainWorktree) {
			plan.skipped.push({ ...ref, reason: "project's main checkout" });
		} else if (worktree.hasWorkspace !== false) {
			plan.skipped.push({ ...ref, reason: "already a workspace" });
		} else {
			plan.candidates.push(ref);
		}
	};

	if (!args.paths) {
		for (const worktree of worktrees) {
			if (!worktree.isMainWorktree) classify(worktree);
		}
		return plan;
	}

	const byPath = new Map(
		worktrees.map((worktree) => [
			normalizePath(worktree.path, args.onThisMachine),
			worktree,
		]),
	);
	const seen = new Set<string>();
	for (const path of args.paths) {
		const key = normalizePath(path, args.onThisMachine);
		if (seen.has(key)) continue;
		seen.add(key);
		const worktree = byPath.get(key);
		if (worktree) {
			classify(worktree);
		} else {
			plan.failed.push({
				path,
				reason: "not a worktree of this project with a branch checked out",
			});
		}
	}
	return plan;
}

export async function importWorktrees(
	client: ImportClient,
	args: { projectId: string; plan: ImportPlan; runSetup: boolean },
): Promise<ImportReport> {
	const report: ImportReport = {
		imported: [],
		skipped: [...args.plan.skipped],
		failed: [...args.plan.failed],
	};
	for (const worktree of args.plan.candidates) {
		try {
			const result = await client.workspaces.create.mutate({
				projectId: args.projectId,
				branch: worktree.branch,
				worktreePath: worktree.path,
				runSetup: args.runSetup,
			});
			if (result.alreadyExists) {
				report.skipped.push({
					...worktree,
					reason: "already a workspace",
					workspaceId: result.workspace.id,
				});
			} else {
				report.imported.push({ ...worktree, workspaceId: result.workspace.id });
			}
		} catch (error) {
			report.failed.push({ ...worktree, reason: rawErrorMessage(error) });
		}
	}
	return report;
}
