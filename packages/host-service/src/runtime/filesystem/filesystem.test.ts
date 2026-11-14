import { expect, test } from "bun:test";
import { join } from "node:path";
import { seedProject, seedWorkspace } from "../../../test/helpers/seed";
import { createTestDb } from "../../trpc/router/pull-requests/shared/test-db";
import { WorkspaceFilesystemManager } from "./filesystem";

function setUp() {
	const db = createTestDb();
	const project = seedProject(
		{ db },
		{
			repoPath: "/src/web",
			repoName: "web",
			repositories: [
				{ repoPath: "/src/docs", repoName: "docs" },
				{ repoPath: "/src/api", repoName: "api" },
			],
		},
	);
	return { db, project, manager: new WorkspaceFilesystemManager({ db }) };
}

test("the config checkout is the primary's when the workspace checks it out", () => {
	const { db, project, manager } = setUp();
	seedWorkspace(
		{ db },
		{ id: "ws", projectId: project.id, worktreePath: "/ws", branch: "b" },
	);

	expect(manager.resolveConfigCheckoutPath("ws")).toBe(join("/ws", "web"));
});

test("without the primary, the config checkout is the first by repository name", () => {
	const { db, project, manager } = setUp();
	const [, docsId, apiId] = project.repositoryIds as [string, string, string];
	seedWorkspace(
		{ db },
		{
			id: "ws",
			projectId: project.id,
			worktreePath: "/ws",
			branch: "b",
			repositoryIds: [docsId, apiId],
		},
	);

	expect(manager.resolveConfigCheckoutPath("ws")).toBe(join("/ws", "api"));
});
