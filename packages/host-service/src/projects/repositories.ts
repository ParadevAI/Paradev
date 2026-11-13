import { basename } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, repositories } from "../db/schema";
import type { RepositorySnapshot } from "../events/types";
import { getPathState } from "../runtime/path-state";
import { parseSparseCheckoutPaths } from "../trpc/router/workspace-creation/shared/sparse-checkout";

export type { RepositorySnapshot };

export type HostRepositoryRow = typeof repositories.$inferSelect;

/** The folder a repository's checkout gets in a multi-repo workspace. */
export function repositoryName(input: {
	repoName?: string | null;
	repoPath: string;
}): string {
	return input.repoName || basename(input.repoPath);
}

const byName = (a: { name: string }, b: { name: string }) =>
	a.name.localeCompare(b.name);

export function listProjectRepositories(
	db: HostDb,
	projectId: string,
): HostRepositoryRow[] {
	return db
		.select()
		.from(repositories)
		.where(eq(repositories.projectId, projectId))
		.all()
		.sort(byName);
}

export function listRepositoriesByProjectId(
	db: HostDb,
	projectIds: string[],
): Map<string, HostRepositoryRow[]> {
	const byProject = new Map<string, HostRepositoryRow[]>();
	if (projectIds.length === 0) return byProject;
	const wanted = new Set(projectIds);
	for (const row of db.select().from(repositories).all()) {
		if (!wanted.has(row.projectId)) continue;
		const list = byProject.get(row.projectId);
		if (list) list.push(row);
		else byProject.set(row.projectId, [row]);
	}
	for (const list of byProject.values()) list.sort(byName);
	return byProject;
}

export function getRepository(
	db: HostDb,
	id: string,
): HostRepositoryRow | undefined {
	return db.select().from(repositories).where(eq(repositories.id, id)).get();
}

export function getPrimaryRepository(
	db: HostDb,
	project: { primaryRepositoryId: string },
): HostRepositoryRow | undefined {
	return getRepository(db, project.primaryRepositoryId);
}

/** The repository at `repoPath` that belongs to a live project, if any. */
export function getLiveRepositoryAtPath(
	db: HostDb,
	repoPath: string,
): HostRepositoryRow | undefined {
	return db
		.select({ repository: repositories })
		.from(repositories)
		.innerJoin(projects, eq(projects.id, repositories.projectId))
		.where(and(eq(repositories.repoPath, repoPath), isNull(projects.deletedAt)))
		.get()?.repository;
}

export function getRepositoryAtPathIncludingDeleted(
	db: HostDb,
	repoPath: string,
): HostRepositoryRow | undefined {
	return db
		.select()
		.from(repositories)
		.where(eq(repositories.repoPath, repoPath))
		.get();
}

export function toRepositorySnapshot(
	row: HostRepositoryRow,
	primaryRepositoryId: string,
): RepositorySnapshot {
	return {
		id: row.id,
		projectId: row.projectId,
		isPrimary: row.id === primaryRepositoryId,
		name: row.name,
		path: row.repoPath,
		provider: row.provider === "github" ? "github" : null,
		owner: row.owner,
		repoName: row.repoName,
		url: row.url,
		remoteName: row.remoteName,
		sparseCheckoutPaths: parseSparseCheckoutPaths(row.sparseCheckoutPaths),
		pathState: repositoryPathState(row.repoPath),
	};
}

function repositoryPathState(path: string): RepositorySnapshot["pathState"] {
	const state = getPathState(path);
	if (state === "directory") return "ok";
	return state === "inaccessible" ? "inaccessible" : "missing";
}
