import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { projects, repositories, workspaces } from "../../../db/schema";
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
import type { HostServiceContext } from "../../../types";
import type { HostWorkspaceRow } from "../../../workspaces/local-workspace-store";
import { rethrowEnvironmentalGitError } from "../git/utils/classify-git-error";
import {
	applyRelocations,
	type CreateProjectResult,
	classifyGitFailure,
	type Relocation,
	type ResolvedSource,
	removeCreated,
	repositoryTakenError,
	repositoryValues,
	requireUniqueNames,
	requireUsableNames,
	resolveRepositoryFolder,
	snapshotOf,
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
	repositories: { id: string; name: string; url: string | null }[];
}

export type SetupPlacementMode =
	| { kind: "clone"; parentDir: string; allowRelocate?: boolean }
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
 * project and repository ids, or check where this host already has it.
 */
export async function setupProject(
	ctx: HostServiceContext,
	args: SetupProjectArgs,
): Promise<CreateProjectResult> {
	requireDistinctPlacements(args.repositories);
	const existing = getProjectIncludingDeleted(ctx.db, args.projectId);
	if (existing) {
		await placeExisting(ctx, existing, args.repositories, args.signal);
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

/**
 * Checks every placement before anything changes, clones the repositories
 * whose folder is gone, checks again, then moves the repositories in one
 * transaction and only then brings back a deleted project, so a refused
 * set-up leaves the project and its folders as they were. Nothing awaits
 * between the last check and the restore, so the restore cannot be refused.
 */
async function placeExisting(
	ctx: HostServiceContext,
	project: HostProjectRow,
	placements: SetupPlacement[],
	signal?: AbortSignal,
): Promise<void> {
	const projectId = project.id;
	const projectRows = listProjectRepositories(ctx.db, projectId);
	const rows = new Map(projectRows.map((row) => [row.id, row]));
	for (const placement of placements) {
		if (!rows.has(placement.id)) {
			throw repositoryNotFound(projectId, placement.id);
		}
	}
	const relocations: Relocation[] = [];
	const clones: Clone[] = [];
	for (const { id, mode } of placements) {
		const row = rows.get(id) as HostRepositoryRow;
		const current = resolvePath(row.repoPath);
		if (mode.kind === "clone") {
			const parentDir = resolvePath(mode.parentDir);
			const sameParent = dirname(current) === parentDir;
			if (sameParent && (await isCheckoutOf(row, current))) continue;
			const target = row.url
				? join(parentDir, cloneDirectoryName(row.url))
				: null;
			if (row.url && target === current && !existsSync(current)) {
				clones.push({ repository: row, url: row.url, parentDir });
				continue;
			}
			if (row.url && target && target !== current && mode.allowRelocate) {
				clones.push({ repository: row, url: row.url, parentDir, target });
				continue;
			}
			throw sameParent ? folderUnusableError(row) : alreadySetUpError(row);
		}
		const resolved = await resolveRepositoryFolder(row, mode.path, CHECK_ONLY);
		if (resolved.repoPath === current) continue;
		if (!mode.allowRelocate) throw alreadySetUpError(row);
		relocations.push({ repository: row, resolved });
	}
	const relocated = new Map([
		...relocations.map(
			({ repository, resolved }) => [repository.id, resolved.repoPath] as const,
		),
		...clones.flatMap(({ repository, target }) =>
			target ? [[repository.id, target] as const] : [],
		),
	]);
	const requireFreeTargets = () => {
		if (!getProjectIncludingDeleted(ctx.db, projectId)) {
			throw notSetUpError(projectId);
		}
		const targets = new Set<string>();
		for (const row of projectRows) {
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
	};
	requireFreeTargets();
	const cloned = await cloneAll(ctx, clones, signal);
	try {
		await adoptAll(relocations.map(({ resolved }) => resolved));
		requireFreeTargets();
	} catch (err) {
		await removeCreated(
			cloned.map(({ resolved }) => ({ resolved, created: true })),
		);
		throw err;
	}
	applyRelocations(
		ctx,
		projectId,
		[...relocations, ...cloned],
		movableWorkspaces(ctx, project),
	);
	if (project.deletedAt != null && !restoreProject(ctx, projectId)) {
		throw notSetUpError(projectId);
	}
}

interface Clone {
	repository: HostRepositoryRow;
	url: string;
	parentDir: string;
	/** Set when the clone relocates the repository away from its stored folder. */
	target?: string;
}

/** Every clone lands, or every folder made for them is removed. */
async function cloneAll(
	ctx: HostServiceContext,
	clones: Clone[],
	signal?: AbortSignal,
): Promise<Relocation[]> {
	const settled = await Promise.allSettled(
		clones.map(async ({ repository, url, parentDir }) => ({
			repository,
			resolved: await classifyGitFailure(
				cloneRepoInto(url, parentDir, ctx.credentials, signal),
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

function requireUsableOrigin(
	origin: SetupOrigin,
	placements: SetupPlacement[],
	projectId: string,
): void {
	const ids = new Set(origin.repositories.map((r) => r.id));
	if (ids.size !== origin.repositories.length) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "invalid_origin: a repository id is listed twice",
		});
	}
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
	const placed = new Set(placements.map((p) => p.id));
	const unplaced = origin.repositories.filter((r) => !placed.has(r.id));
	if (unplaced.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `repository_unplaced: pick a folder for ${unplaced
				.map((r) => r.name)
				.join(", ")}`,
		});
	}
	for (const placement of placements) {
		const repository = origin.repositories.find((r) => r.id === placement.id);
		if (placement.mode.kind === "clone" && !repository?.url) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `no_clone_url: ${repository?.name} has no remote to clone; use an existing folder`,
			});
		}
	}
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
	for (const { id } of origin.repositories) {
		if (getRepository(ctx.db, id)) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `repository_id_taken: repository ${id} belongs to another project on this host`,
			});
		}
	}
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
		throw new TRPCError({
			code: "CONFLICT",
			message: `repository_id_taken: project ${projectId} or one of its repositories was set up on this host by another request`,
			cause: err,
		});
	}
	const row = getLocalProject(ctx.db, projectId);
	if (row) emitProjectChanged(ctx, "created", row);
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
