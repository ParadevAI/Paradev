import { existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import {
	projects,
	repositories,
	workspaceRepositories,
	workspaces,
} from "../../../db/schema";
import {
	emitProjectChanged,
	getLocalProject,
	getProjectIncludingDeleted,
	type HostProjectRow,
} from "../../../projects/local-project-store";
import { restoreProject } from "../../../projects/project-deletion";
import {
	getLiveRepositoryAtPath,
	getRepository,
	type HostRepositoryRow,
	listProjectRepositories,
} from "../../../projects/repositories";
import { isMissingPath } from "../../../runtime/path-state";
import type { HostServiceContext } from "../../../types";
import { listWorkspaceCheckouts } from "../../../workspaces/checkouts";
import type { HostWorkspaceRow } from "../../../workspaces/local-workspace-store";
import { rethrowEnvironmentalGitError } from "../git/utils/classify-git-error";
import {
	applyRelocations,
	type CreateProjectResult,
	classifyGitFailure,
	duplicateNameError,
	type Relocation,
	type ResolvedSource,
	removeCreated,
	repositoryTakenError,
	repositoryValues,
	requireUniqueNames,
	requireUsableNames,
	resolveRepositoryFolder,
	snapshotOf,
	workspaceList,
} from "./handlers";
import {
	adoptLocalRepo,
	cloneDirectoryName,
	cloneRepoInto,
	ensureNotUnborn,
	type ResolvedRepo,
	resolveMatchingSlug,
} from "./utils/resolve-repo";

export interface SetupOrigin {
	name: string;
	primaryRepositoryId: string;
	repositories: OriginRepository[];
}

interface OriginRepository {
	id: string;
	name: string;
	url: string | null;
}

export type SetupPlacementMode =
	| {
			kind: "clone";
			parentDir: string;
			/** Ignored: a clone never replaces a folder that still works. */
			allowRelocate?: boolean;
	  }
	| { kind: "import"; path: string; allowRelocate?: boolean };

export interface SetupPlacement {
	id: string;
	mode: SetupPlacementMode;
}

export interface SetupProjectArgs {
	projectId: string;
	origin?: SetupOrigin;
	repositories: SetupPlacement[];
	signal?: AbortSignal;
}

/**
 * Add a project that lives on another host to this host under the same
 * project and repository ids, or check where this host already has it. The
 * origin's repositories this host lacks are added to its project.
 */
export async function setupProject(
	ctx: HostServiceContext,
	args: SetupProjectArgs,
): Promise<CreateProjectResult> {
	requireDistinctPlacements(args.repositories);
	const existing = getProjectIncludingDeleted(ctx.db, args.projectId);
	if (existing) {
		await placeExisting(
			ctx,
			existing,
			args.origin,
			args.repositories,
			args.signal,
		);
		if (!getLocalProject(ctx.db, args.projectId)) {
			throw notSetUpError(args.projectId);
		}
		return { ...snapshotOf(ctx, args.projectId), created: false };
	}
	if (!args.origin) throw notSetUpError(args.projectId);
	return {
		...(await placeNew(
			ctx,
			args.projectId,
			args.origin,
			args.repositories,
			args.signal,
		)),
		created: true,
	};
}

function notSetUpError(projectId: string): TRPCError {
	return new TRPCError({
		code: "NOT_FOUND",
		message: `not_set_up: project ${projectId} is not on this host; pass origin to set it up`,
	});
}

function requireDistinctPlacements(placements: SetupPlacement[]): void {
	const seen = new Set<string>();
	for (const { id } of placements) {
		if (seen.has(id)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `duplicate_placement: repository ${id} is placed twice`,
			});
		}
		seen.add(id);
	}
}

function repositoryNotFound(projectId: string, id: string): TRPCError {
	return new TRPCError({
		code: "NOT_FOUND",
		message: `repository_not_found: project ${projectId} has no repository ${id}`,
	});
}

/** Read-only; the caller adopts the folder once every placement is accepted. */
async function resolveImport(
	path: string,
	url: string | null,
): Promise<ResolvedRepo> {
	if (!url) return adoptLocalRepo(path, CHECK_ONLY);
	const parsed = parseGitHubRemote(url);
	if (!parsed) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Could not parse GitHub remote from ${url}`,
		});
	}
	return resolveMatchingSlug(
		path,
		`${parsed.owner}/${parsed.name}`,
		CHECK_ONLY,
	);
}

const CHECK_ONLY = { checkOnly: true } as const;

async function adoptAll(folders: ResolvedRepo[]): Promise<void> {
	for (const { repoPath } of folders) await ensureNotUnborn(repoPath);
}

function alreadySetUpError(row: HostRepositoryRow): TRPCError {
	return new TRPCError({
		code: "CONFLICT",
		message: `already_set_up: ${row.name} is already at ${row.repoPath} on this host; relocate it to use another folder`,
	});
}

function folderUnusableError(row: HostRepositoryRow): TRPCError {
	return new TRPCError({
		code: "CONFLICT",
		message: `repository_folder_unusable: ${row.name} is set up at ${row.repoPath}, but that folder is missing or is not a checkout of it; pick its folder with an import placement`,
	});
}

async function isCheckoutOf(
	row: HostRepositoryRow,
	path: string,
): Promise<boolean> {
	if (!existsSync(path)) return false;
	try {
		return (
			(await resolveRepositoryFolder(row, path, CHECK_ONLY)).repoPath === path
		);
	} catch (err) {
		rethrowEnvironmentalGitError(err);
		return false;
	}
}

/** A worktree stays linked to the clone it was made from, so its repository cannot move. */
function requireNoWorktrees(
	ctx: HostServiceContext,
	repository: HostRepositoryRow,
): void {
	const own = resolvePath(repository.repoPath);
	const worktrees = ctx.db
		.select({ workspace: workspaces })
		.from(workspaceRepositories)
		.innerJoin(workspaces, eq(workspaces.id, workspaceRepositories.workspaceId))
		.where(eq(workspaceRepositories.repositoryId, repository.id))
		.all()
		.map((row) => row.workspace)
		.filter((workspace) => {
			if (workspace.type === "local") return false;
			const checkout = listWorkspaceCheckouts(ctx.db, workspace).find(
				(c) => c.repository.id === repository.id,
			);
			if (!checkout || resolvePath(checkout.path) === own) return false;
			return workspace.archivedAt === null || !isMissingPath(checkout.path);
		});
	if (worktrees.length === 0) return;
	const one = worktrees.length === 1;
	throw new TRPCError({
		code: "PRECONDITION_FAILED",
		message: `repository_has_worktrees: ${repository.name} cannot move to another folder while ${workspaceList(worktrees)} ${one ? "uses a worktree" : "use worktrees"} of it; keep its folder at ${repository.repoPath}, or delete ${one ? "that workspace" : "those workspaces"} first`,
	});
}

interface AddedSource {
	repository: OriginRepository;
	source: ResolvedSource;
}

/**
 * Checks every placement before anything changes, clones the repositories
 * whose folder is gone and those the origin adds, checks again, then moves
 * and adds the repositories in one transaction and only then brings back a
 * deleted project, so a refused set-up leaves the project and its folders as
 * they were. Nothing awaits between the last check and the restore, so the
 * restore cannot be refused.
 */
async function placeExisting(
	ctx: HostServiceContext,
	project: HostProjectRow,
	origin: SetupOrigin | undefined,
	placements: SetupPlacement[],
	signal?: AbortSignal,
): Promise<void> {
	const projectId = project.id;
	const projectRows = listProjectRepositories(ctx.db, projectId);
	const rows = new Map(projectRows.map((row) => [row.id, row]));
	const addedById = new Map(
		repositoriesToAdd(ctx, origin, projectRows, placements).map((r) => [
			r.id,
			r,
		]),
	);
	for (const placement of placements) {
		if (!rows.has(placement.id) && !addedById.has(placement.id)) {
			throw repositoryNotFound(projectId, placement.id);
		}
	}
	const relocations: Relocation[] = [];
	const clones: Clone[] = [];
	const added: AddedSource[] = [];
	for (const { id, mode } of placements) {
		const repository = addedById.get(id);
		if (repository) {
			if (mode.kind === "clone") {
				clones.push({
					added: repository,
					url: repository.url as string,
					parentDir: mode.parentDir,
				});
			} else {
				added.push({
					repository,
					source: {
						resolved: await resolveImport(mode.path, repository.url),
						created: false,
					},
				});
			}
			continue;
		}
		const row = rows.get(id) as HostRepositoryRow;
		const current = resolvePath(row.repoPath);
		if (mode.kind === "clone") {
			if (await isCheckoutOf(row, current)) continue;
			if (!row.url) throw folderUnusableError(row);
			const parentDir = resolvePath(mode.parentDir);
			const target = join(parentDir, cloneDirectoryName(row.url));
			if (target !== current) {
				clones.push({ repository: row, url: row.url, parentDir, target });
				continue;
			}
			if (!existsSync(current)) {
				clones.push({ repository: row, url: row.url, parentDir });
				continue;
			}
			throw folderUnusableError(row);
		}
		const resolved = await resolveRepositoryFolder(row, mode.path, CHECK_ONLY);
		if (resolved.repoPath === current) continue;
		if (!mode.allowRelocate) throw alreadySetUpError(row);
		relocations.push({ repository: row, resolved });
	}
	const relocated = new Map<string, string>([
		...relocations.map(
			({ repository, resolved }) => [repository.id, resolved.repoPath] as const,
		),
		...clones.flatMap((clone) =>
			"repository" in clone && clone.target
				? [[clone.repository.id, clone.target] as const]
				: [],
		),
	]);
	const requireFreeTargets = () => {
		if (!getProjectIncludingDeleted(ctx.db, projectId)) {
			throw notSetUpError(projectId);
		}
		const targets = new Set<string>();
		for (const row of projectRows) {
			if (relocated.has(row.id)) requireNoWorktrees(ctx, row);
			const target = relocated.get(row.id) ?? resolvePath(row.repoPath);
			if (targets.has(target)) throw repositoryTakenError(target);
			targets.add(target);
			const mustBeFree = relocated.has(row.id) || project.deletedAt != null;
			const owner = mustBeFree
				? getLiveRepositoryAtPath(ctx.db, target)
				: undefined;
			if (owner && owner.projectId !== projectId) {
				throw repositoryTakenError(target);
			}
		}
		for (const { source } of added) {
			const target = source.resolved.repoPath;
			if (targets.has(target) || getLiveRepositoryAtPath(ctx.db, target)) {
				throw repositoryTakenError(target);
			}
			targets.add(target);
		}
	};
	requireFreeTargets();
	const cloned = await cloneAll(ctx, clones, signal);
	const created = cloned.map(({ resolved }) => ({ resolved, created: true }));
	const clonedRelocations: Relocation[] = [];
	for (const { clone, resolved } of cloned) {
		if ("repository" in clone) {
			clonedRelocations.push({ repository: clone.repository, resolved });
		} else {
			added.push({
				repository: clone.added,
				source: { resolved, created: true },
			});
		}
	}
	try {
		await adoptAll([
			...relocations.map(({ resolved }) => resolved),
			...added.flatMap(({ source }) =>
				source.created ? [] : [source.resolved],
			),
		]);
		requireFreeTargets();
	} catch (err) {
		await removeCreated(created);
		throw err;
	}
	try {
		applyRelocations(
			ctx,
			projectId,
			[...relocations, ...clonedRelocations],
			movableWorkspaces(ctx, project),
			added.map(({ repository, source }) =>
				repositoryValues(projectId, source.resolved, repository),
			),
		);
	} catch (err) {
		await removeCreated(created);
		if (!isUniqueViolation(err)) throw err;
		if (isNameClash(err)) {
			const taken = new Set(
				listProjectRepositories(ctx.db, projectId).map((row) => row.name),
			);
			const name =
				added.find(({ repository }) => taken.has(repository.name))?.repository
					.name ?? "";
			throw duplicateNameError(name);
		}
		throw raceIdTakenError(projectId, err);
	}
	if (project.deletedAt != null && !restoreProject(ctx, projectId)) {
		throw notSetUpError(projectId);
	}
}

type Clone = { url: string; parentDir: string } & (
	| {
			repository: HostRepositoryRow;
			/** Set when the clone relocates the repository away from its stored folder. */
			target?: string;
	  }
	| { added: OriginRepository }
);

/** Every clone lands, or every folder made for them is removed. */
async function cloneAll(
	ctx: HostServiceContext,
	clones: Clone[],
	signal?: AbortSignal,
): Promise<{ clone: Clone; resolved: ResolvedRepo }[]> {
	const settled = await Promise.allSettled(
		clones.map(async (clone) => ({
			clone,
			resolved: await classifyGitFailure(
				cloneRepoInto(clone.url, clone.parentDir, ctx.credentials, signal),
			),
		})),
	);
	const done = settled.flatMap((r) =>
		r.status === "fulfilled" ? [r.value] : [],
	);
	const failed = settled.find((r) => r.status === "rejected");
	if (failed) {
		await removeCreated(
			done.map(({ resolved }) => ({ resolved, created: true })),
		);
		throw failed.reason;
	}
	return done;
}

/** The workspaces that may follow a relocated repository: live ones, or those a deleted project will bring back. */
function movableWorkspaces(
	ctx: HostServiceContext,
	project: HostProjectRow,
): HostWorkspaceRow[] {
	return ctx.db
		.select()
		.from(workspaces)
		.where(
			and(
				eq(workspaces.projectId, project.id),
				eq(workspaces.type, "local"),
				project.deletedAt == null
					? isNull(workspaces.archivedAt)
					: eq(workspaces.archivedAt, project.deletedAt),
			),
		)
		.all();
}

function requireDistinctOriginIds(origin: SetupOrigin): Set<string> {
	const ids = new Set(origin.repositories.map((r) => r.id));
	if (ids.size !== origin.repositories.length) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "invalid_origin: a repository id is listed twice",
		});
	}
	return ids;
}

function requireFreeIds(
	ctx: HostServiceContext,
	repositoryList: OriginRepository[],
): void {
	for (const { id } of repositoryList) {
		if (getRepository(ctx.db, id)) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `repository_id_taken: repository ${id} belongs to another project on this host`,
			});
		}
	}
}

function requirePlaced(
	repositoryList: OriginRepository[],
	placements: SetupPlacement[],
): void {
	const modes = new Map(placements.map((p) => [p.id, p.mode]));
	const unplaced = repositoryList.filter((r) => !modes.has(r.id));
	if (unplaced.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `repository_unplaced: pick a folder for ${unplaced
				.map((r) => r.name)
				.join(", ")}`,
		});
	}
	for (const repository of repositoryList) {
		if (modes.get(repository.id)?.kind === "clone" && !repository.url) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `no_clone_url: ${repository.name} has no remote to clone; use an existing folder`,
			});
		}
	}
}

/** The origin's repositories this host lacks, checked as a fresh set-up checks them. */
function repositoriesToAdd(
	ctx: HostServiceContext,
	origin: SetupOrigin | undefined,
	projectRows: HostRepositoryRow[],
	placements: SetupPlacement[],
): OriginRepository[] {
	if (!origin) return [];
	const known = new Set(projectRows.map((row) => row.id));
	const added = origin.repositories.filter((r) => !known.has(r.id));
	if (added.length === 0) return [];
	requireDistinctOriginIds(origin);
	const names = [
		...projectRows.map((row) => row.name),
		...added.map((r) => r.name),
	];
	requireUsableNames(names);
	requireUniqueNames(names);
	requireFreeIds(ctx, added);
	requirePlaced(added, placements);
	return added;
}

function requireUsableOrigin(
	origin: SetupOrigin,
	placements: SetupPlacement[],
	projectId: string,
): void {
	const ids = requireDistinctOriginIds(origin);
	if (!ids.has(origin.primaryRepositoryId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "invalid_origin: the primary repository is not in the list",
		});
	}
	const names = origin.repositories.map((r) => r.name);
	requireUsableNames(names);
	requireUniqueNames(names);
	for (const placement of placements) {
		if (!ids.has(placement.id)) {
			throw repositoryNotFound(projectId, placement.id);
		}
	}
	requirePlaced(origin.repositories, placements);
}

async function resolvePlacement(
	ctx: HostServiceContext,
	url: string | null,
	mode: SetupPlacementMode,
	signal?: AbortSignal,
): Promise<ResolvedSource> {
	if (mode.kind === "import") {
		return { resolved: await resolveImport(mode.path, url), created: false };
	}
	return {
		resolved: await classifyGitFailure(
			cloneRepoInto(url as string, mode.parentDir, ctx.credentials, signal),
		),
		created: true,
	};
}

async function placeNew(
	ctx: HostServiceContext,
	projectId: string,
	origin: SetupOrigin,
	placements: SetupPlacement[],
	signal?: AbortSignal,
) {
	requireUsableOrigin(origin, placements, projectId);
	requireFreeIds(ctx, origin.repositories);
	const byId = new Map(origin.repositories.map((r) => [r.id, r]));
	const settled = await Promise.allSettled(
		placements.map((p) =>
			resolvePlacement(ctx, byId.get(p.id)?.url ?? null, p.mode, signal),
		),
	);
	const done = settled.flatMap((r) =>
		r.status === "fulfilled" ? [r.value] : [],
	);
	const failed = settled.find((r) => r.status === "rejected");
	if (failed) {
		await removeCreated(done);
		throw failed.reason;
	}
	try {
		requireFreePaths(ctx, done);
		await adoptAll(
			done.flatMap(({ resolved, created }) => (created ? [] : [resolved])),
		);
		insertSetUpProject(ctx, projectId, origin, placements, done);
	} catch (err) {
		await removeCreated(done);
		throw err;
	}
	return snapshotOf(ctx, projectId);
}

function insertSetUpProject(
	ctx: HostServiceContext,
	projectId: string,
	origin: SetupOrigin,
	placements: SetupPlacement[],
	sources: ResolvedSource[],
): void {
	requireFreePaths(ctx, sources);
	const rows = placements.map((placement, index) => {
		const repository = origin.repositories.find((r) => r.id === placement.id);
		const source = sources[index];
		if (!repository || !source) throw new Error("placement without a source");
		return repositoryValues(projectId, source.resolved, {
			id: repository.id,
			name: repository.name,
		});
	});
	try {
		ctx.db.transaction((tx) => {
			tx.insert(projects)
				.values({
					id: projectId,
					name: origin.name.trim() || projectId,
					primaryRepositoryId: origin.primaryRepositoryId,
					updatedAt: Date.now(),
				})
				.run();
			tx.insert(repositories).values(rows).run();
		});
	} catch (err) {
		if (!isUniqueViolation(err)) throw err;
		throw raceIdTakenError(projectId, err);
	}
	const row = getLocalProject(ctx.db, projectId);
	if (row) emitProjectChanged(ctx, "created", row);
}

function raceIdTakenError(projectId: string, cause: unknown): TRPCError {
	return new TRPCError({
		code: "CONFLICT",
		message: `repository_id_taken: project ${projectId} or one of its repositories was set up on this host by another request`,
		cause,
	});
}

function isUniqueViolation(err: unknown): boolean {
	for (let e = err; e instanceof Error; e = e.cause) {
		const code = (e as { code?: unknown }).code;
		if (
			code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
			code === "SQLITE_CONSTRAINT_UNIQUE"
		) {
			return true;
		}
	}
	return false;
}

function isNameClash(err: unknown): boolean {
	for (let e = err; e instanceof Error; e = e.cause) {
		if (e.message.includes("repositories.name")) return true;
	}
	return false;
}

function requireFreePaths(
	ctx: HostServiceContext,
	sources: ResolvedSource[],
): void {
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
}
