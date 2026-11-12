import { writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";

// ponytail: UX experiment of container projects stored as hidden child rows.
// See plans/multi-repo-local-prototype.md before building on it.

export function isContainerProject(project: { kind: string } | undefined) {
	return project?.kind === "container";
}

export function listRepositoryProjects(db: HostDb, projectId: string) {
	return db
		.select()
		.from(projects)
		.where(
			and(eq(projects.parentProjectId, projectId), isNull(projects.deletedAt)),
		)
		.all()
		.sort((a, b) => a.createdAt - b.createdAt);
}

export interface RepositoryOwner {
	projectId: string;
	repositoryName: string;
}

/** Each multi-repo project id becomes its repositories' ids; other ids stay. */
export function expandRepositoryProjectIds(db: HostDb, projectIds: string[]) {
	const ownerByRepositoryId = new Map<string, RepositoryOwner>();
	const expanded: string[] = [];
	for (const projectId of projectIds) {
		const project = db
			.select({ kind: projects.kind })
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		if (!isContainerProject(project)) {
			expanded.push(projectId);
			continue;
		}
		for (const repository of listRepositoryProjects(db, projectId)) {
			expanded.push(repository.id);
			ownerByRepositoryId.set(repository.id, {
				projectId,
				repositoryName: basename(repository.repoPath),
			});
		}
	}
	return { projectIds: expanded, ownerByRepositoryId };
}

export function listRepositoryWorkspaces(
	db: HostDb,
	workspaceId: string,
	{ includeArchived = false }: { includeArchived?: boolean } = {},
) {
	return db
		.select()
		.from(workspaces)
		.where(
			and(
				eq(workspaces.parentWorkspaceId, workspaceId),
				includeArchived ? undefined : isNull(workspaces.archivedAt),
			),
		)
		.all()
		.sort((a, b) => a.createdAt - b.createdAt);
}

export function isContainerWorkspace(db: HostDb, workspaceId: string) {
	return listRepositoryWorkspaces(db, workspaceId).length > 0;
}

/**
 * The main checkout of the repository whose checkout holds `path`, or "" when
 * no checkout of this multi-repo workspace holds it.
 */
export function repositoryRootPathFor(
	db: HostDb,
	workspaceId: string,
	path: string,
): string {
	let holder: { worktreePath: string; projectId: string | null } | undefined;
	for (const checkout of listRepositoryWorkspaces(db, workspaceId)) {
		const inside = relative(checkout.worktreePath, path);
		if (inside.startsWith("..") || isAbsolute(inside)) continue;
		if (!holder || checkout.worktreePath.length > holder.worktreePath.length) {
			holder = checkout;
		}
	}
	if (!holder?.projectId) return "";
	return (
		db
			.select({ repoPath: projects.repoPath })
			.from(projects)
			.where(eq(projects.id, holder.projectId))
			.get()?.repoPath ?? ""
	);
}

/** Tells agents started in a container workspace where each repository is. */
export function writeWorkspaceContextFiles(
	root: string,
	checkouts: Array<{ worktreePath: string; branch: string }>,
) {
	const lines = [
		"# Workspace",
		"",
		"This folder is a multi-repository workspace. It is not a git repository itself.",
		"Each repository below is its own git checkout. Run git commands inside the",
		"repository you mean, and expect a change to span several repositories.",
		"",
		"| Repository | Path | Branch |",
		"| --- | --- | --- |",
		...checkouts.map(
			(checkout) =>
				`| ${basename(checkout.worktreePath)} | ${checkout.worktreePath} | ${checkout.branch} |`,
		),
		"",
	];
	writeFileSync(join(root, "AGENTS.md"), lines.join("\n"));
	writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
}
