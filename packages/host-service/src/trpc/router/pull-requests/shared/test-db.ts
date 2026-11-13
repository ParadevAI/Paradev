import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import {
	projects,
	pullRequests,
	repositories,
	workspaceRepositories,
	workspaces,
} from "../../../../db/schema";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../../drizzle");

export function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

export const PROJECT_ID = "project-1";
export const REPOSITORY_ID = "repository-1";
export const PR_NUMBER = 42;
/** A PR the host has a row for but no live workspace is on. */
export const UNLINKED_PR_NUMBER = 43;
export const REPO = { owner: "octocat", name: "hello" };

/** A project whose one repository is at `repoPath`. */
export function seedProjectWithRepository(
	db: HostDb,
	ids: { projectId: string; repositoryId: string },
	repoPath: string,
) {
	db.insert(projects)
		.values({ id: ids.projectId, primaryRepositoryId: ids.repositoryId })
		.run();
	db.insert(repositories)
		.values({
			id: ids.repositoryId,
			projectId: ids.projectId,
			name: REPO.name,
			repoPath,
		})
		.run();
}

/**
 * One project with PR #42 linked from two live workspaces (most recent
 * activity first: ws-newer, ws-older), one archived workspace still pointing
 * at it, one unlinked workspace, and PR #43 with a row but no links.
 * `rowProjectId` puts the PR rows under a sibling project's repository.
 */
export function seedLinkedPullRequest(
	db: HostDb,
	repoPath = "/tmp/repo",
	options: { rowProjectId?: string; isDraft?: boolean } = {},
) {
	seedProjectWithRepository(
		db,
		{ projectId: PROJECT_ID, repositoryId: REPOSITORY_ID },
		repoPath,
	);
	let rowRepositoryId = REPOSITORY_ID;
	if (options.rowProjectId && options.rowProjectId !== PROJECT_ID) {
		rowRepositoryId = `${options.rowProjectId}-repository`;
		seedProjectWithRepository(
			db,
			{ projectId: options.rowProjectId, repositoryId: rowRepositoryId },
			`${repoPath}-sibling`,
		);
	}
	db.insert(pullRequests)
		.values([
			pullRequestRow(
				"pr-42",
				rowRepositoryId,
				REPO,
				PR_NUMBER,
				options.isDraft,
			),
			pullRequestRow("pr-43", rowRepositoryId, REPO, UNLINKED_PR_NUMBER),
		])
		.run();
	seedWorkspaceRow(db, "ws-older", repoPath, "pr-42", { lastActivityAt: 1 });
	// Activity, not metadata, decides recency: the older row has the newer
	// updatedAt.
	seedWorkspaceRow(db, "ws-newer", repoPath, "pr-42", {
		lastActivityAt: 2,
		updatedAt: 1,
	});
	seedWorkspaceRow(db, "ws-archived", repoPath, "pr-42", {
		lastActivityAt: 3,
		archivedAt: 1_700_000_000_000,
	});
	seedWorkspaceRow(db, "ws-unlinked", repoPath, null, { lastActivityAt: 4 });
}

/**
 * A second row for PR #42 under the repository spelled with different
 * casing, as a sibling project that resolved its remote differently would
 * write, linked from one live workspace.
 */
export function seedDuplicateCasingRow(db: HostDb, repoPath = "/tmp/repo") {
	db.insert(pullRequests)
		.values(
			pullRequestRow(
				"pr-42-dup",
				REPOSITORY_ID,
				{ owner: "OctoCat", name: "Hello" },
				PR_NUMBER,
			),
		)
		.run();
	seedWorkspaceRow(db, "ws-dup", repoPath, "pr-42-dup", { lastActivityAt: 5 });
}

export function readPullRequestRow(db: HostDb, id = "pr-42") {
	return db
		.select({
			state: pullRequests.state,
			isDraft: pullRequests.isDraft,
			mergedAt: pullRequests.mergedAt,
			repositoryId: pullRequests.repositoryId,
		})
		.from(pullRequests)
		.where(eq(pullRequests.id, id))
		.get();
}

function pullRequestRow(
	id: string,
	repositoryId: string,
	repo: { owner: string; name: string },
	prNumber: number,
	isDraft = false,
) {
	return {
		id,
		repositoryId,
		repoProvider: "github",
		repoOwner: repo.owner,
		repoName: repo.name,
		prNumber,
		url: `https://github.com/${repo.owner}/${repo.name}/pull/${prNumber}`,
		title: `PR ${prNumber}`,
		state: isDraft ? "draft" : "open",
		isDraft,
		headBranch: `feature/${prNumber}`,
		headSha: `sha-${prNumber}`,
	};
}

function seedWorkspaceRow(
	db: HostDb,
	id: string,
	repoPath: string,
	pullRequestId: string | null,
	fields: {
		lastActivityAt: number;
		updatedAt?: number;
		archivedAt?: number;
	},
) {
	const branch = pullRequestId ? "feature/42" : "main";
	db.insert(workspaces)
		.values({
			id,
			projectId: PROJECT_ID,
			worktreePath: `${repoPath}-${id}`,
			branch,
			createdAt: fields.lastActivityAt,
			updatedAt: fields.updatedAt ?? fields.lastActivityAt,
			lastActivityAt: fields.lastActivityAt,
			archivedAt: fields.archivedAt ?? null,
		})
		.run();
	db.insert(workspaceRepositories)
		.values({
			workspaceId: id,
			repositoryId: REPOSITORY_ID,
			branch,
			pullRequestId,
		})
		.run();
}
