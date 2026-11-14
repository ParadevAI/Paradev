import { basename, join, resolve as resolvePath } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { projects, repositories } from "../../../db/schema";
import {
	emitProjectChanged,
	getLocalProject,
} from "../../../projects/local-project-store";
import { restoreProject } from "../../../projects/project-deletion";
import {
	getLiveRepositoryAtPath,
	getRepository,
	type HostRepositoryRow,
	listProjectRepositories,
} from "../../../projects/repositories";
import type { HostServiceContext } from "../../../types";
import {
	type CreateProjectResult,
	classifyGitFailure,
	type ResolvedSource,
	relocateRepository,
	removeCreated,
	repositoryTakenError,
	repositoryValues,
	requireUniqueNames,
	requireUsableName,
	resolveRepositoryFolder,
	snapshotOf,
} from "./handlers";
import {
	adoptLocalRepo,
	cloneRepoInto,
	type ResolvedRepo,
	resolveMatchingSlug,
} from "./utils/resolve-repo";

export interface SetupOrigin {
	name: string;
	primaryRepositoryId: string;
	repositories: { id: string; name: string; url: string | null }[];
}

export type SetupPlacementMode =
	| { kind: "clone"; parentDir: string }
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
	restoreProject(ctx, args.projectId);
	if (getLocalProject(ctx.db, args.projectId)) {
		await placeExisting(ctx, args.projectId, args.repositories);
		return { ...snapshotOf(ctx, args.projectId), created: false };
	}
	if (!args.origin) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `not_set_up: project ${args.projectId} is not on this host; pass origin to set it up`,
		});
	}
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

async function resolveImport(
	path: string,
	url: string | null,
): Promise<ResolvedRepo> {
	if (!url) return adoptLocalRepo(path);
	const parsed = parseGitHubRemote(url);
	if (!parsed) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Could not parse GitHub remote from ${url}`,
		});
	}
	return resolveMatchingSlug(path, `${parsed.owner}/${parsed.name}`);
}

function alreadySetUpError(row: HostRepositoryRow): TRPCError {
	return new TRPCError({
		code: "CONFLICT",
		message: `already_set_up: ${row.name} is already at ${row.repoPath} on this host; relocate it to use another folder`,
	});
}

async function placeExisting(
	ctx: HostServiceContext,
	projectId: string,
	placements: SetupPlacement[],
): Promise<void> {
	const rows = new Map(
		listProjectRepositories(ctx.db, projectId).map((row) => [row.id, row]),
	);
	for (const placement of placements) {
		if (!rows.has(placement.id)) {
			throw repositoryNotFound(projectId, placement.id);
		}
	}
	for (const { id, mode } of placements) {
		const row = rows.get(id) as HostRepositoryRow;
		if (mode.kind === "clone") {
			const predicted = join(
				resolvePath(mode.parentDir),
				basename(row.repoPath),
			);
			if (predicted !== row.repoPath) throw alreadySetUpError(row);
			continue;
		}
		const resolved = await resolveRepositoryFolder(row, mode.path);
		const owner = getLiveRepositoryAtPath(ctx.db, resolved.repoPath);
		if (owner && owner.id !== row.id) {
			throw repositoryTakenError(resolved.repoPath);
		}
		if (resolved.repoPath === row.repoPath) continue;
		if (!mode.allowRelocate) throw alreadySetUpError(row);
		await relocateRepository(ctx, {
			projectId,
			repositoryId: id,
			path: mode.path,
		});
	}
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
	for (const name of names) requireUsableName(name);
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
	const rows = placements.map((placement, index) => {
		const repository = origin.repositories.find((r) => r.id === placement.id);
		const source = sources[index];
		if (!repository || !source) throw new Error("placement without a source");
		return repositoryValues(projectId, source.resolved, {
			id: repository.id,
			name: repository.name,
		});
	});
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
	const row = getLocalProject(ctx.db, projectId);
	if (row) emitProjectChanged(ctx, "created", row);
}
