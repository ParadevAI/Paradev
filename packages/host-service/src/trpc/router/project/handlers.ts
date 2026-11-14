import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
	projects,
	pullRequests,
	repositories,
	workspaceRepositories,
	workspaces,
} from "../../../db/schema";
import type { ProjectSnapshot } from "../../../events/types";
import {
	emitProjectChanged,
	getLiveProjectAtPath,
	getLocalProject,
	getProjectAtPathIncludingDeleted,
	type HostProjectRow,
	toProjectSnapshot,
} from "../../../projects/local-project-store";
import { restoreProject } from "../../../projects/project-deletion";
import {
	getLiveRepositoryAtPath,
	getRepository,
	type HostRepositoryRow,
	listProjectRepositories,
	repositoryName,
} from "../../../projects/repositories";
import type { HostServiceContext } from "../../../types";
import {
	emitLocalWorkspaceUpdated,
	getLocalWorkspace,
	type HostWorkspaceRow,
} from "../../../workspaces/local-workspace-store";
import { rethrowEnvironmentalGitError } from "../git/utils/classify-git-error";
import { revokeRootTrustForNewPrimary } from "../workspace-creation/shared/seed-agent-trust";
import {
	syncWorkspaceContextFiles,
	WORKSPACE_ROOT_ENTRIES,
} from "../workspace-creation/shared/workspace-context-files";
import { listLiveLocalWorkspaces } from "./utils/create-local-workspace";
import {
	adoptLocalRepo,
	cloneRepoInto,
	cloneTemplateInto,
	initEmptyRepo,
	initLocalRepoInPlace,
	type ResolvedRepo,
	resolveMatchingSlug,
	tryRevParseGitRoot,
} from "./utils/resolve-repo";

export type RepositorySource =
	| { kind: "local"; path: string; initIfNeeded?: boolean }
	| { kind: "clone"; url: string }
	| { kind: "empty"; name: string }
	| { kind: "template"; url: string };

function dirNameForEmpty(name: string): string {
	const slug = name
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Repository name must produce a non-empty directory name",
		});
	}
	return slug;
}

function dirNameForTemplate(url: string): string {
	const last = url
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "")
		.split(/[/:\\]/)
		.filter(Boolean)
		.pop();
	return dirNameForEmpty(last ?? "");
}

export async function classifyGitFailure<T>(work: Promise<T>): Promise<T> {
	try {
		return await work;
	} catch (err) {
		rethrowEnvironmentalGitError(err);
		throw err;
	}
}

export interface ResolvedSource {
	resolved: ResolvedRepo;
	/** We made this folder, so a failure later removes it. */
	created: boolean;
}

function requireParentDir(parentDir: string | undefined): string {
	if (!parentDir?.trim()) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Pick a folder for new and cloned repositories (parentDir)",
		});
	}
	return parentDir;
}

async function resolveSource(
	ctx: HostServiceContext,
	source: RepositorySource,
	parentDir: string | undefined,
	signal?: AbortSignal,
): Promise<ResolvedSource> {
	switch (source.kind) {
		case "local": {
			if (!source.initIfNeeded) {
				return { resolved: await adoptLocalRepo(source.path), created: false };
			}
			const root = await tryRevParseGitRoot(source.path);
			return {
				resolved: root
					? await adoptLocalRepo(root)
					: await initLocalRepoInPlace(source.path),
				created: false,
			};
		}
		case "clone":
			return {
				resolved: await classifyGitFailure(
					cloneRepoInto(
						source.url,
						requireParentDir(parentDir),
						ctx.credentials,
						signal,
					),
				),
				created: true,
			};
		case "empty":
			return {
				resolved: await classifyGitFailure(
					initEmptyRepo(
						requireParentDir(parentDir),
						dirNameForEmpty(source.name),
					),
				),
				created: true,
			};
		case "template":
			return {
				resolved: await classifyGitFailure(
					cloneTemplateInto(
						source.url,
						requireParentDir(parentDir),
						dirNameForTemplate(source.url),
						ctx.credentials,
					),
				),
				created: true,
			};
	}
}

export async function removeCreated(sources: ResolvedSource[]): Promise<void> {
	for (const { resolved, created } of sources) {
		if (!created) continue;
		await rm(resolved.repoPath, { recursive: true, force: true }).catch(
			(cleanupErr) =>
				console.warn("[project] repository cleanup failed", {
					repoPath: resolved.repoPath,
					cleanupErr,
				}),
		);
	}
}

/** Every source resolves, or every folder made for them is removed. */
async function resolveSources(
	ctx: HostServiceContext,
	sources: RepositorySource[],
	parentDir: string | undefined,
	signal?: AbortSignal,
): Promise<ResolvedSource[]> {
	const settled = await Promise.allSettled(
		sources.map((source) => resolveSource(ctx, source, parentDir, signal)),
	);
	const done = settled.flatMap((r) =>
		r.status === "fulfilled" ? [r.value] : [],
	);
	const failed = settled.find((r) => r.status === "rejected");
	if (failed) {
		await removeCreated(done);
		throw failed.reason;
	}
	return done;
}

function duplicateNameError(name: string): TRPCError {
	return new TRPCError({
		code: "CONFLICT",
		message: `duplicate_name: the project already has a repository named "${name}"`,
	});
}

export function repositoryTakenError(path: string): TRPCError {
	return new TRPCError({
		code: "CONFLICT",
		message: `repository_taken: ${path} already belongs to a project on this device`,
	});
}

function nameOf(resolved: ResolvedRepo): string {
	return repositoryName({
		repoName: resolved.parsed?.name,
		repoPath: resolved.repoPath,
	});
}

/** Names are folder names, so compare them the way a case-insensitive disk would. */
export function requireUniqueNames(names: string[]): void {
	const seen = new Set<string>();
	for (const name of names) {
		const key = name.toLowerCase();
		if (seen.has(key)) throw duplicateNameError(name);
		seen.add(key);
	}
}

const RESERVED_NAMES = new Set(
	WORKSPACE_ROOT_ENTRIES.map((entry) => entry.toLowerCase()),
);

/** Only a project with several repositories gives its workspaces a root folder whose own files a name can collide with. */
export function requireUsableNames(names: string[]): void {
	for (const name of names) {
		if (name === "" || name === "." || name === ".." || /[/\\\0]/.test(name)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `invalid_name: "${name}" cannot be the folder name of a repository`,
			});
		}
	}
	if (names.length < 2) return;
	const reserved = names.find((name) => RESERVED_NAMES.has(name.toLowerCase()));
	if (reserved === undefined) return;
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: `reserved_name: a project with several repositories cannot have one named "${reserved}", the workspace folder uses that name for its own files`,
	});
}

export function repositoryValues(
	projectId: string,
	resolved: ResolvedRepo,
	identity?: { id: string; name: string },
) {
	const now = Date.now();
	return {
		id: identity?.id ?? randomUUID(),
		projectId,
		name: identity?.name ?? nameOf(resolved),
		repoPath: resolved.repoPath,
		provider: resolved.parsed ? ("github" as const) : null,
		owner: resolved.parsed?.owner ?? null,
		repoName: resolved.parsed?.name ?? null,
		url: resolved.parsed?.url ?? null,
		remoteName: resolved.remoteName,
		createdAt: now,
		updatedAt: now,
	};
}

export function snapshotOf(
	ctx: HostServiceContext,
	projectId: string,
): ProjectSnapshot {
	const row = getLocalProject(ctx.db, projectId);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	}
	return toProjectSnapshot(ctx.db, row);
}

function requireProject(
	ctx: HostServiceContext,
	projectId: string,
): HostProjectRow {
	const row = getLocalProject(ctx.db, projectId);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project is not set up on this host",
		});
	}
	return row;
}

function requireRepositoryOf(
	ctx: HostServiceContext,
	projectId: string,
	repositoryId: string,
) {
	const repository = getRepository(ctx.db, repositoryId);
	if (!repository || repository.projectId !== projectId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `repository_not_found: project ${projectId} has no repository ${repositoryId}`,
		});
	}
	return repository;
}

function touchProject(ctx: HostServiceContext, projectId: string): void {
	ctx.db
		.update(projects)
		.set({ updatedAt: Date.now() })
		.where(eq(projects.id, projectId))
		.run();
	const row = getLocalProject(ctx.db, projectId);
	if (row) emitProjectChanged(ctx, "updated", row);
}

export type CreateProjectResult = ProjectSnapshot & {
	/** False when one local folder that already was a project was reused. */
	created: boolean;
};

/**
 * Create a project from one or more repositories, the first being the
 * primary. Fully local; the cloud is never involved.
 */
export async function createProject(
	ctx: HostServiceContext,
	args: {
		name: string;
		repositories: RepositorySource[];
		parentDir?: string;
		signal?: AbortSignal;
	},
): Promise<CreateProjectResult> {
	const name = args.name.trim();
	if (!name) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Name the project" });
	}
	if (args.repositories.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Add a repository to the project",
		});
	}

	const [first] = args.repositories;
	if (args.repositories.length === 1 && first?.kind === "local") {
		const { resolved } = await resolveSource(ctx, first, args.parentDir);
		// Importing a folder that already is a project returns that project
		// untouched; a deleted one is restored.
		const existing =
			getLiveProjectAtPath(ctx.db, resolved.repoPath) ??
			getProjectAtPathIncludingDeleted(ctx.db, resolved.repoPath);
		if (existing) {
			restoreProject(ctx, existing.id);
			return { ...snapshotOf(ctx, existing.id), created: false };
		}
		return {
			...insertProject(ctx, name, [{ resolved, created: false }]),
			created: true,
		};
	}

	const resolved = await resolveSources(
		ctx,
		args.repositories,
		args.parentDir,
		args.signal,
	);
	try {
		return { ...insertProject(ctx, name, resolved), created: true };
	} catch (err) {
		await removeCreated(resolved);
		throw err;
	}
}

function insertProject(
	ctx: HostServiceContext,
	name: string,
	sources: ResolvedSource[],
): ProjectSnapshot {
	const paths = new Set<string>();
	for (const { resolved } of sources) {
		if (
			paths.has(resolved.repoPath) ||
			getLiveRepositoryAtPath(ctx.db, resolved.repoPath)
		) {
			throw repositoryTakenError(resolved.repoPath);
		}
		paths.add(resolved.repoPath);
	}
	const names = sources.map(({ resolved }) => nameOf(resolved));
	requireUsableNames(names);
	requireUniqueNames(names);

	const projectId = randomUUID();
	const rows = sources.map(({ resolved }) =>
		repositoryValues(projectId, resolved),
	);
	const [primary] = rows;
	if (!primary) throw new Error("insertProject needs a repository");
	ctx.db.transaction((tx) => {
		tx.insert(projects)
			.values({
				id: projectId,
				name,
				primaryRepositoryId: primary.id,
				updatedAt: Date.now(),
			})
			.run();
		tx.insert(repositories).values(rows).run();
	});
	const row = getLocalProject(ctx.db, projectId);
	if (row) emitProjectChanged(ctx, "created", row);
	return snapshotOf(ctx, projectId);
}

/** Live workspaces are not changed: they gain no checkout. */
export async function addRepository(
	ctx: HostServiceContext,
	args: {
		projectId: string;
		source: RepositorySource;
		parentDir?: string;
		signal?: AbortSignal;
	},
): Promise<ProjectSnapshot> {
	requireProject(ctx, args.projectId);
	const [source] = await resolveSources(
		ctx,
		[args.source],
		args.parentDir,
		args.signal,
	);
	if (!source) throw new Error("addRepository resolved nothing");
	try {
		const { resolved } = source;
		const owner = getLiveRepositoryAtPath(ctx.db, resolved.repoPath);
		if (owner) {
			throw owner.projectId === args.projectId
				? new TRPCError({
						code: "CONFLICT",
						message:
							"repository_taken: this repository is already part of the project",
					})
				: repositoryTakenError(resolved.repoPath);
		}
		const names = [
			...listProjectRepositories(ctx.db, args.projectId).map((r) => r.name),
			nameOf(resolved),
		];
		requireUsableNames(names);
		requireUniqueNames(names);
		ctx.db
			.insert(repositories)
			.values(repositoryValues(args.projectId, resolved))
			.run();
	} catch (err) {
		await removeCreated([source]);
		throw err;
	}
	touchProject(ctx, args.projectId);
	return snapshotOf(ctx, args.projectId);
}

/**
 * Removes the repository from the project, never its files. A repository a
 * live workspace checks out stays; archived workspaces lose that checkout.
 */
export function removeRepository(
	ctx: HostServiceContext,
	args: { projectId: string; repositoryId: string },
): ProjectSnapshot {
	const project = requireProject(ctx, args.projectId);
	const repository = requireRepositoryOf(
		ctx,
		args.projectId,
		args.repositoryId,
	);
	if (repository.id === project.primaryRepositoryId) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "primary_repository: make another repository the primary first",
		});
	}
	if (listProjectRepositories(ctx.db, args.projectId).length <= 1) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "last_repository: a project needs at least one repository",
		});
	}
	const users = ctx.db
		.select({ id: workspaces.id, name: workspaces.name })
		.from(workspaceRepositories)
		.innerJoin(workspaces, eq(workspaces.id, workspaceRepositories.workspaceId))
		.where(
			and(
				eq(workspaceRepositories.repositoryId, repository.id),
				isNull(workspaces.archivedAt),
			),
		)
		.all();
	if (users.length > 0) {
		const shown = users.slice(0, 3).map((u) => `"${u.name}"`);
		const more =
			users.length > shown.length
				? ` and ${users.length - shown.length} more`
				: "";
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `repository_in_use: ${repository.name} is checked out by ${shown.join(", ")}${more}; delete them first`,
		});
	}
	// PR rows are shared by GitHub identity: another clone of the same
	// repository may link them, so they move to it instead of cascading.
	const twin =
		repository.owner && repository.repoName
			? ctx.db
					.select({ id: repositories.id })
					.from(repositories)
					.where(
						and(
							ne(repositories.id, repository.id),
							sql`lower(${repositories.owner}) = lower(${repository.owner})`,
							sql`lower(${repositories.repoName}) = lower(${repository.repoName})`,
						),
					)
					.get()
			: undefined;
	ctx.db.transaction((tx) => {
		if (twin) {
			tx.update(pullRequests)
				.set({ repositoryId: twin.id })
				.where(eq(pullRequests.repositoryId, repository.id))
				.run();
		}
		tx.delete(workspaceRepositories)
			.where(
				and(
					eq(workspaceRepositories.repositoryId, repository.id),
					inArray(
						workspaceRepositories.workspaceId,
						tx
							.select({ id: workspaces.id })
							.from(workspaces)
							.where(isNotNull(workspaces.archivedAt)),
					),
				),
			)
			.run();
		tx.delete(repositories).where(eq(repositories.id, repository.id)).run();
	});
	touchProject(ctx, args.projectId);
	return snapshotOf(ctx, args.projectId);
}

export async function setPrimaryRepository(
	ctx: HostServiceContext,
	args: { projectId: string; repositoryId: string },
): Promise<ProjectSnapshot> {
	const project = requireProject(ctx, args.projectId);
	requireRepositoryOf(ctx, args.projectId, args.repositoryId);
	ctx.db
		.update(projects)
		.set({ primaryRepositoryId: args.repositoryId })
		.where(eq(projects.id, args.projectId))
		.run();
	if (project.primaryRepositoryId !== args.repositoryId) {
		await revokeRootTrustForNewPrimary(ctx.db, args.projectId);
	}
	const live = ctx.db
		.select()
		.from(workspaces)
		.where(
			and(
				eq(workspaces.projectId, args.projectId),
				isNull(workspaces.archivedAt),
			),
		)
		.all();
	for (const row of live) {
		syncWorkspaceContextFiles(ctx.db, row.id);
		emitLocalWorkspaceUpdated(ctx, row);
	}
	touchProject(ctx, args.projectId);
	return snapshotOf(ctx, args.projectId);
}

/** A repository with a GitHub remote only accepts a folder with the same remote. */
export function resolveRepositoryFolder(
	repository: Pick<HostRepositoryRow, "owner" | "repoName">,
	path: string,
): Promise<ResolvedRepo> {
	return repository.owner && repository.repoName
		? resolveMatchingSlug(path, `${repository.owner}/${repository.repoName}`)
		: adoptLocalRepo(path);
}

/**
 * Point a repository at the folder it now lives in. A repository with a
 * GitHub remote only accepts a folder with the same remote. Its name stays:
 * live workspaces keep their checkout folders.
 */
export async function relocateRepository(
	ctx: HostServiceContext,
	args: { projectId: string; repositoryId: string; path: string },
): Promise<ProjectSnapshot> {
	requireProject(ctx, args.projectId);
	const repository = requireRepositoryOf(
		ctx,
		args.projectId,
		args.repositoryId,
	);
	const resolved = await resolveRepositoryFolder(repository, args.path);
	const owner = getLiveRepositoryAtPath(ctx.db, resolved.repoPath);
	if (owner && owner.id !== repository.id) {
		throw repositoryTakenError(resolved.repoPath);
	}
	if (resolved.repoPath !== repository.repoPath) {
		applyRelocations(
			ctx,
			args.projectId,
			[{ repository, resolved }],
			listLiveLocalWorkspaces(ctx, args.projectId),
		);
	}
	return snapshotOf(ctx, args.projectId);
}

export interface Relocation {
	repository: HostRepositoryRow;
	resolved: ResolvedRepo;
}

/**
 * Points repositories at new folders in one transaction. Of `candidates`,
 * only a workspace that is a repository's own folder moves with it; a root
 * of several checkouts (a box one too) keeps its folder.
 */
export function applyRelocations(
	ctx: HostServiceContext,
	projectId: string,
	relocations: Relocation[],
	candidates: HostWorkspaceRow[],
): void {
	if (relocations.length === 0) return;
	const moved: string[] = [];
	ctx.db.transaction((tx) => {
		for (const { repository, resolved } of relocations) {
			tx.update(repositories)
				.set({
					repoPath: resolved.repoPath,
					provider: resolved.parsed ? "github" : null,
					owner: resolved.parsed?.owner ?? null,
					repoName: resolved.parsed?.name ?? null,
					url: resolved.parsed?.url ?? null,
					remoteName: resolved.remoteName,
					updatedAt: Date.now(),
				})
				.where(eq(repositories.id, repository.id))
				.run();
			for (const row of candidates) {
				if (row.worktreePath !== repository.repoPath) continue;
				const checkouts = tx
					.select({ repositoryId: workspaceRepositories.repositoryId })
					.from(workspaceRepositories)
					.where(eq(workspaceRepositories.workspaceId, row.id))
					.all();
				if (
					checkouts.length !== 1 ||
					checkouts[0]?.repositoryId !== repository.id
				)
					continue;
				tx.update(workspaces)
					.set({ worktreePath: resolved.repoPath, updatedAt: Date.now() })
					.where(eq(workspaces.id, row.id))
					.run();
				moved.push(row.id);
			}
		}
	});
	for (const id of moved) {
		const row = getLocalWorkspace(ctx.db, id);
		if (row) emitLocalWorkspaceUpdated(ctx, row);
	}
	touchProject(ctx, projectId);
}
