import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { basename } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { projects, workspaces } from "../../../db/schema";
import {
	emitProjectChanged,
	getLiveProjectAtPath,
	getLocalProject,
	getProjectAtPathIncludingDeleted,
} from "../../../projects/local-project-store";
import { isContainerProject } from "../../../projects/multi-repo";
import { restoreProject } from "../../../projects/project-deletion";
import type { HostServiceContext } from "../../../types";
import { rethrowEnvironmentalGitError } from "../git/utils/classify-git-error";
import { persistLocalProject } from "./utils/persist-project";
import {
	adoptLocalRepo,
	cloneRepoInto,
	cloneTemplateInto,
	initEmptyRepo,
	initLocalRepoInPlace,
	type ResolvedRepo,
	tryRevParseGitRoot,
} from "./utils/resolve-repo";

function dirNameForEmpty(name: string): string {
	const slug = name
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project name must produce a non-empty directory name",
		});
	}
	return slug;
}

async function classifyGitFailure<T>(work: Promise<T>): Promise<T> {
	try {
		return await work;
	} catch (err) {
		rethrowEnvironmentalGitError(err);
		throw err;
	}
}

export interface CreateResult {
	projectId: string;
	repoPath: string;
	/** False when an existing local project row for the same repo path was
	 * reused instead of inserting a new one (importLocal only). Callers use
	 * this to skip side effects that would clobber user customizations. */
	created: boolean;
}

/**
 * Create-project saga — fully local, the cloud is never involved:
 *
 *   1. Local file ops (handled by the caller — clone / mkdir / etc.)
 *   2. Local DB project row (host-minted UUID)
 *
 * A project starts with zero workspaces; the user creates a local or
 * worktree workspace when they open it. A failure in step 2 unwinds the
 * file ops when the caller asked for that.
 */
async function persistFromResolved(
	ctx: HostServiceContext,
	args: {
		name: string;
		resolved: ResolvedRepo;
		cleanupRepoPathOnFailure: boolean;
	},
): Promise<CreateResult> {
	const projectId = randomUUID();
	try {
		persistLocalProject(ctx, projectId, args.resolved, { name: args.name });
	} catch (err) {
		if (args.cleanupRepoPathOnFailure) {
			try {
				await rm(args.resolved.repoPath, { recursive: true, force: true });
			} catch (cleanupErr) {
				console.warn("[project.create] repo dir cleanup failed", {
					repoPath: args.resolved.repoPath,
					cleanupErr,
				});
			}
		}
		throw err;
	}
	return { projectId, repoPath: args.resolved.repoPath, created: true };
}

export async function createFromClone(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string; url: string; signal?: AbortSignal },
): Promise<CreateResult> {
	const resolved = await cloneRepoInto(
		args.url,
		args.parentDir,
		ctx.credentials,
		args.signal,
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
	});
}

/**
 * Resolve an existing repo, or — when `initIfNeeded` and the folder isn't a git
 * repo yet — `git init` it in place first. The init branch only runs after the
 * UI has confirmed intent with the user.
 */
async function resolveOrInitLocalRepo(
	repoPath: string,
	initIfNeeded: boolean,
): Promise<ResolvedRepo> {
	if (!initIfNeeded) return adoptLocalRepo(repoPath);
	const root = await tryRevParseGitRoot(repoPath);
	return root ? adoptLocalRepo(root) : initLocalRepoInPlace(repoPath);
}

export async function createFromImportLocal(
	ctx: HostServiceContext,
	args: { name: string; repoPath: string; initIfNeeded?: boolean },
): Promise<CreateResult> {
	const resolved = await resolveOrInitLocalRepo(
		args.repoPath,
		args.initIfNeeded ?? false,
	);

	// Idempotency guard: importing a repo that is already a project on this
	// device returns the existing project instead of minting a duplicate
	// row. Deliberately leaves the row untouched (no rename, no repo-field
	// refresh) — the user may have customized it in v2. A live row wins over
	// a deleted one; a deleted one is restored.
	const existing =
		getLiveProjectAtPath(ctx.db, resolved.repoPath) ??
		getProjectAtPathIncludingDeleted(ctx.db, resolved.repoPath);
	if (existing) {
		restoreProject(ctx, existing.id);
		return {
			projectId: existing.id,
			repoPath: resolved.repoPath,
			created: false,
		};
	}

	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		// User pointed us at an existing folder; never rm it.
		cleanupRepoPathOnFailure: false,
	});
}

/**
 * Empty mode: mkdir + git init + initial commit, then run the saga.
 * The project lives local-only — no GitHub remote until first push.
 */
export async function createFromEmpty(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string },
): Promise<CreateResult> {
	const resolved = await classifyGitFailure(
		initEmptyRepo(args.parentDir, dirNameForEmpty(args.name)),
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
	});
}

/**
 * Template mode: clone the template repo, strip history, re-init, then
 * run the saga. Like empty, the project lives local-only — no GitHub
 * remote until first push.
 */
export async function createFromTemplate(
	ctx: HostServiceContext,
	args: { name: string; parentDir: string; url: string },
): Promise<CreateResult> {
	const resolved = await classifyGitFailure(
		cloneTemplateInto(
			args.url,
			args.parentDir,
			dirNameForEmpty(args.name),
			ctx.credentials,
		),
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
	});
}

async function resolveRepositoryForContainer(
	ctx: HostServiceContext,
	containerId: string | null,
	repoPath: string,
): Promise<ResolvedRepo> {
	const resolved = await adoptLocalRepo(repoPath);
	const owner = getLiveProjectAtPath(ctx.db, resolved.repoPath);
	if (owner) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				owner.parentProjectId === containerId
					? "This repository is already part of the project"
					: `${basename(resolved.repoPath)} already belongs to another project`,
		});
	}
	return resolved;
}

function insertRepositoryRow(
	ctx: HostServiceContext,
	containerId: string,
	resolved: ResolvedRepo,
): string {
	const id = randomUUID();
	ctx.db
		.insert(projects)
		.values({
			id,
			parentProjectId: containerId,
			repoPath: resolved.repoPath,
			repoProvider: resolved.parsed ? "github" : null,
			repoOwner: resolved.parsed?.owner ?? null,
			repoName: resolved.parsed?.name ?? null,
			repoUrl: resolved.parsed?.url ?? null,
			remoteName: resolved.remoteName,
			name: basename(resolved.repoPath),
			updatedAt: Date.now(),
		})
		.run();
	return id;
}

/** A project that holds repositories and has none of its own. */
export async function createContainerProject(
	ctx: HostServiceContext,
	args: { name: string; repoPaths: string[] },
): Promise<{ projectId: string }> {
	const name = args.name.trim();
	if (!name) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Name the project" });
	}
	const resolved: ResolvedRepo[] = [];
	for (const repoPath of args.repoPaths) {
		const repo = await resolveRepositoryForContainer(ctx, null, repoPath);
		if (!resolved.some((other) => other.repoPath === repo.repoPath)) {
			resolved.push(repo);
		}
	}
	const projectId = randomUUID();
	ctx.db
		.insert(projects)
		.values({
			id: projectId,
			kind: "container",
			repoPath: "",
			name,
			updatedAt: Date.now(),
		})
		.run();
	for (const repo of resolved) insertRepositoryRow(ctx, projectId, repo);
	const row = getLocalProject(ctx.db, projectId);
	if (row) emitProjectChanged(ctx.eventBus, "created", row);
	return { projectId };
}

export async function addProjectRepository(
	ctx: HostServiceContext,
	args: { projectId: string; repoPath: string },
): Promise<{ projectId: string; repoPath: string }> {
	const container = getLocalProject(ctx.db, args.projectId);
	if (!isContainerProject(container)) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	}
	const resolved = await resolveRepositoryForContainer(
		ctx,
		args.projectId,
		args.repoPath,
	);
	return {
		projectId: insertRepositoryRow(ctx, args.projectId, resolved),
		repoPath: resolved.repoPath,
	};
}

export function removeProjectRepository(
	ctx: HostServiceContext,
	args: { projectId: string; repositoryProjectId: string },
): void {
	const repo = getLocalProject(ctx.db, args.repositoryProjectId);
	if (!repo || repo.parentProjectId !== args.projectId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
	}
	const inUse = ctx.db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, repo.id), isNull(workspaces.archivedAt)),
		)
		.get();
	if (inUse) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Delete the workspaces that use this repository first",
		});
	}
	ctx.db.delete(projects).where(eq(projects.id, repo.id)).run();
}
