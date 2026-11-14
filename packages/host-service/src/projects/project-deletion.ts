import { existsSync } from "node:fs";
import { rmdir } from "node:fs/promises";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import {
	projects,
	tagFolderSettings,
	terminalAgentBindings,
	terminalSessions,
	workspaces,
} from "../db/schema";
import { isMissingPath } from "../runtime/path-state";
import { runTeardown } from "../runtime/teardown";
import { disposeSessionsByWorkspaceId } from "../terminal/terminal";
import { cleanupGitOps } from "../trpc/router/workspace-cleanup/git-ops";
import { isLocalCheckoutWorkspace } from "../trpc/router/workspace-cleanup/is-local-checkout-workspace";
import { removeWorkspaceContextFiles } from "../trpc/router/workspace-creation/shared/workspace-context-files";
import type { HostServiceContext } from "../types";
import { listWorkspaceCheckouts } from "../workspaces/checkouts";
import {
	archiveLocalWorkspace,
	trackWorkspaceDeleted,
	unarchiveLocalWorkspace,
} from "../workspaces/local-workspace-store";
import { resolveWorkspaceScriptContext } from "../workspaces/script-context";
import {
	emitProjectChanged,
	getProjectIncludingDeleted,
	type HostProjectRow,
} from "./local-project-store";
import {
	getLiveRepositoryAtPath,
	listProjectRepositories,
} from "./repositories";

export const PROJECT_RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const PROJECT_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function repoTakenError() {
	return new TRPCError({
		code: "CONFLICT",
		message: "Repository is already set up as another project on this device.",
	});
}

type ProjectDeletionContext = Pick<
	HostServiceContext,
	"db" | "eventBus" | "api" | "credentials" | "organizationId"
> &
	Partial<Pick<HostServiceContext, "clientMachineId" | "userId">>;

/**
 * Hide the project and every live workspace in it for everyone on this
 * device, stop what is running in them, and keep their worktrees on disk so
 * restoreProject can bring them back until the purge window ends.
 */
export async function softDeleteProject(
	ctx: ProjectDeletionContext,
	projectId: string,
): Promise<{ deletedAt: number } | null> {
	const project = getProjectIncludingDeleted(ctx.db, projectId);
	if (!project) return null;
	if (project.deletedAt != null) {
		return { deletedAt: project.deletedAt };
	}
	const deletedAt = Date.now();
	const live = ctx.db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.archivedAt)),
		)
		.all();
	ctx.db.transaction((tx) => {
		tx.update(projects)
			.set({
				deletedAt,
				deletedByUserId: ctx.userId ?? null,
				updatedAt: deletedAt,
			})
			.where(eq(projects.id, projectId))
			.run();
		if (live.length > 0)
			tx.update(workspaces)
				.set({
					archivedAt: deletedAt,
					archiveReason: "deleted",
					updatedAt: deletedAt,
				})
				.where(
					inArray(
						workspaces.id,
						live.map((row) => row.id),
					),
				)
				.run();
	});
	for (const row of live) archiveLocalWorkspace(ctx, row.id, "deleted");
	emitProjectChanged(ctx, "deleted", projectId);
	await Promise.all(live.map((row) => stopWorkspace(ctx, row.id)));
	return { deletedAt };
}

async function stopWorkspace(ctx: ProjectDeletionContext, workspaceId: string) {
	const local = ctx.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	const context = local ? resolveWorkspaceScriptContext(ctx.db, local) : null;
	// A local workspace is the repository itself; teardown is for worktrees.
	const onRepository =
		local !== undefined &&
		(local.type === "local" ||
			(await isLocalCheckoutWorkspace(ctx as HostServiceContext, local.id))
				.sharesProjectCheckout);
	if (local && context && !onRepository) {
		const teardown = await runTeardown({
			db: ctx.db,
			workspaceId,
			worktreePath: context.configWorktreePath ?? undefined,
			scriptRoot: context.scriptRoot,
			repoPath: context.repoPath,
			projectId: context.projectId,
		}).catch((err: unknown) => ({ status: "failed" as const, err }));
		if (teardown.status === "failed") {
			console.warn("[project-deletion] teardown failed", {
				workspaceId,
				teardown,
			});
		}
	}
	const killed = await disposeSessionsByWorkspaceId(workspaceId, ctx.db).catch(
		(err: unknown) => {
			console.warn("[project-deletion] terminal dispose failed", {
				workspaceId,
				err,
			});
			return { terminated: 0, failed: 1 };
		},
	);
	if (killed.failed > 0) {
		console.warn("[project-deletion] terminals may still be running", {
			workspaceId,
			failed: killed.failed,
		});
	}
}

function workspacesDeletedWith(
	ctx: Pick<ProjectDeletionContext, "db">,
	project: { id: string; deletedAt: number },
) {
	return ctx.db
		.select()
		.from(workspaces)
		.where(
			and(
				eq(workspaces.projectId, project.id),
				eq(workspaces.archivedAt, project.deletedAt),
			),
		)
		.all();
}

/**
 * Bring back a soft-deleted project and the workspaces that were deleted
 * with it. A workspace whose worktree has since disappeared stays archived.
 * Refused while another live project owns the same repo path.
 */
export function restoreProject(
	ctx: ProjectDeletionContext,
	projectId: string,
): { restoredWorkspaceCount: number } | null {
	const project = getProjectIncludingDeleted(ctx.db, projectId);
	if (!project) return null;
	if (project.deletedAt == null) return { restoredWorkspaceCount: 0 };
	const repositoryRows = listProjectRepositories(ctx.db, projectId);
	if (repositoryRows.some((r) => getLiveRepositoryAtPath(ctx.db, r.repoPath)))
		throw repoTakenError();
	const restorable = workspacesDeletedWith(ctx, {
		id: project.id,
		deletedAt: project.deletedAt,
	}).filter(
		(row) =>
			row.type === "local" ||
			(!isMissingPath(row.worktreePath) &&
				listWorkspaceCheckouts(ctx.db, row).every(
					(checkout) => !isMissingPath(checkout.path),
				)),
	);
	ctx.db
		.update(projects)
		.set({ deletedAt: null, deletedByUserId: null, updatedAt: Date.now() })
		.where(eq(projects.id, projectId))
		.run();
	const restored = getProjectIncludingDeleted(ctx.db, projectId);
	if (restored) emitProjectChanged(ctx, "created", restored);
	for (const row of restorable) unarchiveLocalWorkspace(ctx, row.id);
	return { restoredWorkspaceCount: restorable.length };
}

export function listDeletedProjects(ctx: Pick<ProjectDeletionContext, "db">) {
	return ctx.db
		.select()
		.from(projects)
		.where(isNotNull(projects.deletedAt))
		.all()
		.map((row) => ({
			id: row.id,
			name: row.name || row.id,
			repositoryPaths: listProjectRepositories(ctx.db, row.id).map(
				(r) => r.repoPath,
			),
			deletedAt: row.deletedAt as number,
			deletedByUserId: row.deletedByUserId,
			purgeAt: (row.deletedAt as number) + PROJECT_RESTORE_WINDOW_MS,
			workspaceCount: workspacesDeletedWith(ctx, {
				id: row.id,
				deletedAt: row.deletedAt as number,
			}).length,
		}));
}

/**
 * Permanently remove projects deleted longer ago than the restore window.
 * Clean worktrees are removed; git refuses dirty ones, which stay on disk.
 * The repository folder is never removed.
 */
export async function purgeExpiredProjects(
	ctx: ProjectDeletionContext,
	now = Date.now(),
): Promise<number> {
	const expired = ctx.db
		.select()
		.from(projects)
		.where(lt(projects.deletedAt, now - PROJECT_RESTORE_WINDOW_MS))
		.all();
	for (const project of expired) await purgeProject(ctx, project);
	return expired.length;
}

/**
 * Permanently delete a project that is already soft-deleted, without waiting
 * for the restore window to end. Anything live is refused so this can never
 * skip the soft delete.
 */
export async function purgeDeletedProject(
	ctx: ProjectDeletionContext,
	projectId: string,
): Promise<boolean> {
	const project = getProjectIncludingDeleted(ctx.db, projectId);
	if (!project || project.deletedAt == null) return false;
	await purgeProject(ctx, project);
	return true;
}

async function purgeProject(
	ctx: ProjectDeletionContext,
	project: HostProjectRow,
) {
	const rows = ctx.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.projectId, project.id))
		.all();
	const gitEnvByRepo = new Map<
		string,
		Awaited<ReturnType<typeof cleanupGitOps.resolveGitEnv>>
	>();
	for (const row of rows) {
		if (row.type === "local") continue;
		const checkouts = listWorkspaceCheckouts(ctx.db, row);
		for (const checkout of checkouts) {
			const repoPath = checkout.repository.repoPath;
			if (checkout.path === repoPath || !existsSync(checkout.path)) continue;
			try {
				let gitEnv = gitEnvByRepo.get(repoPath);
				if (!gitEnv) {
					gitEnv = await cleanupGitOps.resolveGitEnv(ctx, repoPath);
					gitEnvByRepo.set(repoPath, gitEnv);
				}
				const { stillRegistered, removeError } =
					await cleanupGitOps.removeWorktree({
						repoPath,
						worktreePath: checkout.path,
						gitEnv,
						force: false,
					});
				if (stillRegistered) {
					console.warn("[project-deletion] left worktree on disk", {
						projectId: project.id,
						worktreePath: checkout.path,
						removeError,
					});
				}
			} catch (err) {
				console.warn("[project-deletion] left worktree on disk", {
					projectId: project.id,
					worktreePath: checkout.path,
					err,
				});
			}
		}
		// A multi-repo root holds only the checkouts; a non-empty one stays.
		if (checkouts.length > 1) {
			try {
				await removeWorkspaceContextFiles(
					row.worktreePath,
					checkouts.map((checkout) => checkout.path),
				);
			} catch (err) {
				console.warn("[project-deletion] left workspace files on disk", {
					projectId: project.id,
					root: row.worktreePath,
					err,
				});
			}
			await rmdir(row.worktreePath).catch(() => {});
		}
	}
	ctx.db.transaction((tx) => {
		tx.delete(workspaces).where(eq(workspaces.projectId, project.id)).run();
		tx.delete(projects).where(eq(projects.id, project.id)).run();
		tx.delete(tagFolderSettings)
			.where(eq(tagFolderSettings.scope, project.id))
			.run();
	});
	ctx.eventBus.broadcastTagFoldersChanged({
		scope: project.id,
		settings: [],
		occurredAt: Date.now(),
	});
	for (const row of rows) {
		if (row.archivedAt === project.deletedAt) trackWorkspaceDeleted(ctx, row);
	}
}

/**
 * What deleting this project on this device would stop, per workspace: who
 * it belongs to and what is running in it right now.
 */
export function readDeletionImpact(
	ctx: Pick<ProjectDeletionContext, "db">,
	projectId: string,
) {
	const rows = ctx.db
		.select({
			id: workspaces.id,
			name: workspaces.name,
			createdByUserId: workspaces.createdByUserId,
			lastActivityAt: workspaces.lastActivityAt,
		})
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.archivedAt)),
		)
		.all();
	const ids = rows.map((row) => row.id);
	const terminals = ids.length
		? ctx.db
				.select({
					id: terminalSessions.id,
					workspaceId: terminalSessions.originWorkspaceId,
					lastAttachedAt: terminalSessions.lastAttachedAt,
				})
				.from(terminalSessions)
				.where(
					and(
						inArray(terminalSessions.originWorkspaceId, ids),
						eq(terminalSessions.status, "active"),
						isNull(terminalSessions.disposeRequestedAt),
					),
				)
				.all()
		: [];
	const agents = terminals.length
		? ctx.db
				.select({
					terminalId: terminalAgentBindings.terminalId,
					lastEventAt: terminalAgentBindings.lastEventAt,
				})
				.from(terminalAgentBindings)
				.where(
					and(
						inArray(
							terminalAgentBindings.terminalId,
							terminals.map((terminal) => terminal.id),
						),
						isNull(terminalAgentBindings.endedAt),
					),
				)
				.all()
		: [];
	const agentByTerminal = new Map(
		agents.map((agent) => [agent.terminalId, agent]),
	);
	return rows.map((row) => {
		const own = terminals.filter((terminal) => terminal.workspaceId === row.id);
		const ownAgents = own.flatMap((terminal) => {
			const agent = agentByTerminal.get(terminal.id);
			return agent ? [agent] : [];
		});
		const lastActiveAt = Math.max(
			row.lastActivityAt ?? 0,
			...own.map((terminal) => terminal.lastAttachedAt ?? 0),
			...ownAgents.map((agent) => agent.lastEventAt),
		);
		return {
			workspaceId: row.id,
			name: row.name,
			createdByUserId: row.createdByUserId,
			runningTerminalCount: own.length,
			runningAgentCount: ownAgents.length,
			lastActiveAt: lastActiveAt > 0 ? lastActiveAt : null,
		};
	});
}
