import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import {
	projects,
	pullRequests,
	repositories,
	terminalSessions,
	workspaceRepositories,
	workspaces,
} from "../../src/db/schema";
import type { TestHost } from "./createTestHost";

/**
 * Focused DB-seed helpers. Tests express *what* they need ("a project at
 * this path") rather than the drizzle insert shape, so future schema
 * changes (renames, new columns) only touch this file.
 *
 * Each helper:
 *   - generates a UUID id when none is supplied (so tests can ignore ids
 *     they don't care about)
 *   - returns the fully-populated row's identity fields
 *   - is synchronous against the bun:sqlite-backed db (matches drizzle
 *     `.run()` semantics)
 */

type SeedHost = Pick<TestHost, "db">;

export interface SeedRepositoryOptions {
	id?: string;
	repoPath: string;
	/** Defaults to `repoName`, else the folder name. */
	name?: string;
	repoOwner?: string;
	repoName?: string;
	repoUrl?: string;
	repoProvider?: string;
	remoteName?: string;
}

export interface SeedProjectOptions extends SeedRepositoryOptions {
	/** Extra repositories beside the primary one described by the top-level fields. */
	repositories?: SeedRepositoryOptions[];
	worktreeBaseDir?: string | null;
	/** The project's name; the primary repository's is `repositoryName`. */
	name?: string;
	repositoryName?: string;
}

export function seedRepository(
	host: SeedHost,
	projectId: string,
	options: SeedRepositoryOptions,
): { id: string } {
	const id = options.id ?? randomUUID();
	host.db
		.insert(repositories)
		.values({
			id,
			projectId,
			name: options.name ?? options.repoName ?? basename(options.repoPath),
			repoPath: options.repoPath,
			provider: options.repoProvider,
			owner: options.repoOwner,
			repoName: options.repoName,
			url: options.repoUrl,
			remoteName: options.remoteName,
		})
		.run();
	return { id };
}

/** A project whose primary repository is the one the top-level fields describe. */
export function seedProject(
	host: SeedHost,
	options: SeedProjectOptions & { id?: string; primaryRepositoryId?: string },
): { id: string; repositoryId: string; repositoryIds: string[] } {
	const id = options.id ?? randomUUID();
	const repositoryId = options.primaryRepositoryId ?? randomUUID();
	host.db
		.insert(projects)
		.values({
			id,
			primaryRepositoryId: repositoryId,
			name: options.name ?? "",
			worktreeBaseDir: options.worktreeBaseDir,
		})
		.run();
	seedRepository(host, id, {
		...options,
		id: repositoryId,
		name: options.repositoryName,
	});
	const extra = (options.repositories ?? []).map(
		(repository) => seedRepository(host, id, repository).id,
	);
	return { id, repositoryId, repositoryIds: [repositoryId, ...extra] };
}

export interface SeedWorkspaceOptions {
	id?: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	name?: string;
	type?: "local" | "worktree";
	/** The repositories it checks out; defaults to every repository of the project. */
	repositoryIds?: string[];
	headSha?: string | null;
	upstreamOwner?: string | null;
	upstreamRepo?: string | null;
	upstreamBranch?: string | null;
	pullRequestId?: string | null;
}

export function seedWorkspace(
	host: SeedHost,
	options: SeedWorkspaceOptions,
): { id: string } {
	const id = options.id ?? randomUUID();
	host.db
		.insert(workspaces)
		.values({
			id,
			projectId: options.projectId,
			worktreePath: options.worktreePath,
			branch: options.branch,
			name: options.name ?? options.branch,
			type: options.type ?? "worktree",
		})
		.run();
	const repositoryIds =
		options.repositoryIds ??
		host.db
			.select({ id: repositories.id })
			.from(repositories)
			.where(eq(repositories.projectId, options.projectId))
			.all()
			.map((row) => row.id);
	for (const repositoryId of repositoryIds) {
		host.db
			.insert(workspaceRepositories)
			.values({
				workspaceId: id,
				repositoryId,
				branch: options.branch,
				headSha: options.headSha,
				upstreamOwner: options.upstreamOwner,
				upstreamRepo: options.upstreamRepo,
				upstreamBranch: options.upstreamBranch,
				pullRequestId: options.pullRequestId,
			})
			.run();
	}
	return { id };
}

export interface SeedTerminalSessionOptions {
	id?: string;
	originWorkspaceId: string | null;
	status?: string;
}

export function seedTerminalSession(
	host: SeedHost,
	options: SeedTerminalSessionOptions,
): { id: string } {
	const id = options.id ?? randomUUID();
	host.db
		.insert(terminalSessions)
		.values({
			id,
			originWorkspaceId: options.originWorkspaceId,
			status: options.status ?? "active",
		})
		.run();
	return { id };
}

export interface SeedPullRequestOptions {
	id?: string;
	repositoryId: string;
	repoOwner?: string;
	repoName?: string;
	repoProvider?: string;
	prNumber: number;
	url?: string;
	title?: string;
	state?: string;
	headBranch: string;
	headSha?: string;
	checksStatus?: string;
	checksJson?: string;
	reviewDecision?: string | null;
	error?: string | null;
}

export function seedPullRequest(
	host: SeedHost,
	options: SeedPullRequestOptions,
): { id: string } {
	const id = options.id ?? randomUUID();
	host.db
		.insert(pullRequests)
		.values({
			id,
			repositoryId: options.repositoryId,
			repoProvider: options.repoProvider ?? "github",
			repoOwner: options.repoOwner ?? "octocat",
			repoName: options.repoName ?? "hello",
			prNumber: options.prNumber,
			url:
				options.url ??
				`https://github.com/${options.repoOwner ?? "octocat"}/${options.repoName ?? "hello"}/pull/${options.prNumber}`,
			title: options.title ?? `PR #${options.prNumber}`,
			state: options.state ?? "open",
			headBranch: options.headBranch,
			headSha: options.headSha ?? "deadbeef",
			checksStatus: options.checksStatus ?? "none",
			checksJson: options.checksJson ?? "[]",
			reviewDecision: options.reviewDecision,
			error: options.error,
		})
		.run();
	return { id };
}
