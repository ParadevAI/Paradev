import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { seedProject, seedWorkspace } from "../../test/helpers/seed";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { getLocalWorkspace } from "./local-workspace-store";
import { resolveWorkspaceScriptContext } from "./script-context";

function createDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	runMigrations(db, resolve(import.meta.dir, "../../drizzle"));
	return db as unknown as HostDb;
}

function seedTwoRepoWorkspace(
	db: HostDb,
	repositories: "both" | "web" | "none",
) {
	const project = seedProject(
		{ db },
		{
			repoPath: "/src/web",
			repositoryName: "web",
			repositories: [{ repoPath: "/src/api", name: "api" }],
		},
	);
	const [webId, apiId] = project.repositoryIds as [string, string];
	const { id } = seedWorkspace(
		{ db },
		{
			projectId: project.id,
			worktreePath: "/wt/feat",
			branch: "feat",
			repositoryIds: { both: [webId, apiId], web: [webId], none: [] }[
				repositories
			],
		},
	);
	db.update(schema.projects)
		.set({ primaryRepositoryId: apiId })
		.where(eq(schema.projects.id, project.id))
		.run();
	const workspace = getLocalWorkspace(db, id);
	if (!workspace) throw new Error("workspace not seeded");
	return { projectId: project.id, workspace };
}

test("scripts read the current primary's checkout and run in the workspace root", () => {
	const db = createDb();
	const { projectId, workspace } = seedTwoRepoWorkspace(db, "both");

	expect(resolveWorkspaceScriptContext(db, workspace)).toEqual({
		projectId,
		repoPath: "/src/api",
		configWorktreePath: "/wt/feat/api",
		scriptRoot: "/wt/feat",
	});
});

test("a single-repo workspace of another repository than the primary uses that repository's config", () => {
	const db = createDb();
	const { projectId, workspace } = seedTwoRepoWorkspace(db, "web");

	expect(resolveWorkspaceScriptContext(db, workspace)).toEqual({
		projectId,
		repoPath: "/src/web",
		configWorktreePath: "/wt/feat",
		scriptRoot: "/wt/feat",
	});
});

test("with no checkout, only the primary's main checkout's config is read", () => {
	const db = createDb();
	const { projectId, workspace } = seedTwoRepoWorkspace(db, "none");

	expect(resolveWorkspaceScriptContext(db, workspace)).toEqual({
		projectId,
		repoPath: "/src/api",
		configWorktreePath: null,
		scriptRoot: "/wt/feat",
	});
});
