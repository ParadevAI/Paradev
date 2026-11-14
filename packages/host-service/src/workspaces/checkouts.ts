import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	projects,
	repositories,
	workspaceRepositories,
	workspaces,
} from "../db/schema";
import type { CheckoutSnapshot } from "../events/types";
import type { HostRepositoryRow } from "../projects/repositories";

export type { CheckoutSnapshot };

export type HostCheckoutRow = typeof workspaceRepositories.$inferSelect;

export interface Checkout {
	row: HostCheckoutRow;
	repository: HostRepositoryRow;
	/** Where the checkout is on disk; never stored, see {@link checkoutPath}. */
	path: string;
}

/**
 * A workspace with one checkout is that checkout; with several, each one is
 * the folder named after its repository.
 */
export function checkoutPath(
	workspacePath: string,
	repositoryName: string,
	checkoutCount: number,
): string {
	return checkoutCount === 1
		? workspacePath
		: join(workspacePath, repositoryName);
}

const byRepositoryName = (a: Checkout, b: Checkout) =>
	a.repository.name.localeCompare(b.repository.name);

/**
 * The checkout whose agent config, setup and teardown a workspace uses: the
 * primary repository's, else the first by repository name.
 */
export function pickConfigSource<T>(
	checkouts: readonly T[],
	describe: (checkout: T) => { name: string; isPrimary: boolean },
): T | undefined {
	return (
		checkouts.find((checkout) => describe(checkout).isPrimary) ??
		[...checkouts].sort((a, b) =>
			describe(a).name.localeCompare(describe(b).name),
		)[0]
	);
}

export function configSourceCheckout(
	checkouts: readonly Checkout[],
	primaryRepositoryId: string | null,
): Checkout | undefined {
	return pickConfigSource(checkouts, (checkout) => ({
		name: checkout.repository.name,
		isPrimary: checkout.repository.id === primaryRepositoryId,
	}));
}

export function listWorkspaceCheckouts(
	db: HostDb,
	workspace: { id: string; worktreePath: string },
): Checkout[] {
	const rows = db
		.select({ row: workspaceRepositories, repository: repositories })
		.from(workspaceRepositories)
		.innerJoin(
			repositories,
			eq(repositories.id, workspaceRepositories.repositoryId),
		)
		.where(eq(workspaceRepositories.workspaceId, workspace.id))
		.all();
	return rows
		.map(({ row, repository }) => ({
			row,
			repository,
			path: checkoutPath(workspace.worktreePath, repository.name, rows.length),
		}))
		.sort(byRepositoryName);
}

export function listCheckoutsByWorkspaceId(
	db: HostDb,
	workspaceList: { id: string; worktreePath: string }[],
): Map<string, Checkout[]> {
	const byWorkspace = new Map<string, Checkout[]>();
	if (workspaceList.length === 0) return byWorkspace;
	const pathById = new Map(workspaceList.map((w) => [w.id, w.worktreePath]));
	const rows = db
		.select({ row: workspaceRepositories, repository: repositories })
		.from(workspaceRepositories)
		.innerJoin(
			repositories,
			eq(repositories.id, workspaceRepositories.repositoryId),
		)
		.where(
			inArray(
				workspaceRepositories.workspaceId,
				workspaceList.map((w) => w.id),
			),
		)
		.all();
	const grouped = new Map<string, typeof rows>();
	for (const entry of rows) {
		const list = grouped.get(entry.row.workspaceId);
		if (list) list.push(entry);
		else grouped.set(entry.row.workspaceId, [entry]);
	}
	for (const [workspaceId, list] of grouped) {
		const workspacePath = pathById.get(workspaceId) ?? "";
		byWorkspace.set(
			workspaceId,
			list
				.map(({ row, repository }) => ({
					row,
					repository,
					path: checkoutPath(workspacePath, repository.name, list.length),
				}))
				.sort(byRepositoryName),
		);
	}
	return byWorkspace;
}

export function toCheckoutSnapshot(
	checkout: Checkout,
	primaryRepositoryId: string,
): CheckoutSnapshot {
	const { row, repository, path } = checkout;
	return {
		repositoryId: repository.id,
		name: repository.name,
		isPrimary: repository.id === primaryRepositoryId,
		path,
		branch: row.branch,
		headSha: row.headSha,
		upstream:
			row.upstreamOwner && row.upstreamRepo && row.upstreamBranch
				? {
						owner: row.upstreamOwner,
						repo: row.upstreamRepo,
						branch: row.upstreamBranch,
					}
				: null,
		pullRequestId: row.pullRequestId,
	};
}

export interface ResolvedCheckout {
	workspace: typeof workspaces.$inferSelect;
	/** Null for a project-less session workspace, whose folder is its own repository. */
	repository: HostRepositoryRow | null;
	row: HostCheckoutRow | null;
	path: string;
}

/**
 * The one checkout a git call acts on. `repositoryId` may be omitted only
 * when the workspace has exactly one checkout: on a multi-repo workspace git
 * must never run at the root, which can sit inside an unrelated repository.
 */
export function resolveCheckout(
	db: HostDb,
	workspaceId: string,
	repositoryId?: string | null,
): ResolvedCheckout {
	const workspace = db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
	const checkouts = listWorkspaceCheckouts(db, workspace);
	if (repositoryId) {
		const checkout = checkouts.find((c) => c.repository.id === repositoryId);
		if (!checkout) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `checkout_not_found: workspace ${workspaceId} has no checkout of repository ${repositoryId}`,
			});
		}
		return { ...checkout, workspace };
	}
	const [only] = checkouts;
	if (checkouts.length === 1 && only) return { ...only, workspace };
	if (checkouts.length === 0 && workspace.projectId === null) {
		return {
			workspace,
			repository: null,
			row: null,
			path: workspace.worktreePath,
		};
	}
	if (checkouts.length === 0) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `checkout_not_found: workspace ${workspaceId} has no repository checkouts`,
		});
	}
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: `repository_required: this workspace has several repositories (${checkouts
			.map((c) => `${c.repository.name}=${c.repository.id}`)
			.join(", ")}); pass repositoryId`,
	});
}

/** Points the workspace's branch at the branch every checkout is on, if they share one. */
export function followSharedCheckoutBranch(
	db: HostDb,
	workspaceId: string,
): void {
	const branches = new Set(
		db
			.select({ branch: workspaceRepositories.branch })
			.from(workspaceRepositories)
			.where(eq(workspaceRepositories.workspaceId, workspaceId))
			.all()
			.map((row) => row.branch),
	);
	const [branch] = branches;
	if (branches.size !== 1 || !branch) return;
	db.update(workspaces)
		.set({ branch, updatedAt: Date.now() })
		.where(and(eq(workspaces.id, workspaceId), ne(workspaces.branch, branch)))
		.run();
}

/** A workspace's checkouts as clients see them, primary marked from its project. */
export function getCheckoutSnapshots(
	db: HostDb,
	workspace: { id: string; worktreePath: string; projectId: string | null },
): CheckoutSnapshot[] {
	if (!workspace.projectId) return [];
	const project = db
		.select({ primaryRepositoryId: projects.primaryRepositoryId })
		.from(projects)
		.where(eq(projects.id, workspace.projectId))
		.get();
	return listWorkspaceCheckouts(db, workspace).map((checkout) =>
		toCheckoutSnapshot(checkout, project?.primaryRepositoryId ?? ""),
	);
}
