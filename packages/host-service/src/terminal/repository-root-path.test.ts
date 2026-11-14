import { expect, test } from "bun:test";
import { seedProject, seedWorkspace } from "../../test/helpers/seed";
import { createTestDb } from "../trpc/router/pull-requests/shared/test-db";
import { repositoryRootPath } from "./repository-root-path";

test("a folder whose name starts with two dots is inside its checkout", () => {
	const db = createTestDb();
	const project = seedProject(
		{ db },
		{
			repoPath: "/src/web",
			repoName: "web",
			repositories: [{ repoPath: "/src/api", repoName: "api" }],
		},
	);
	const workspace = {
		id: "ws",
		projectId: project.id,
		worktreePath: "/workspaces/ws",
	};
	seedWorkspace({ db }, { ...workspace, branch: "x" });

	expect(repositoryRootPath(db, workspace, "/workspaces/ws/api/..cache")).toBe(
		"/src/api",
	);
});
