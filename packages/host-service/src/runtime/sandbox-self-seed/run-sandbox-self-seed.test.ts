import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { seedProject, seedWorkspace } from "../../../test/helpers/seed";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { listProjectRepositories } from "../../projects/repositories";
import { resolveCheckout } from "../../workspaces/checkouts";
import {
	runSandboxSelfSeed,
	runSandboxStartHook,
	type SandboxIdentity,
} from "./sandbox-self-seed";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function createDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

function identity(paths: string[], root = "/workspace"): SandboxIdentity {
	return {
		workspaceId: WORKSPACE_ID,
		workspaceRoot: root,
		worktreePath: paths[0] === "." ? root : `${root}/${paths[0]}`,
		workspaceName: "workspace",
		projectName: "project",
		branch: "feat",
		repositories: paths.map((path) => ({
			url: `https://github.com/acme/${path === "." ? "solo" : path}`,
			branch: "feat",
			path,
		})),
		launch: null,
		launchMarkerPath: "/nowhere",
	};
}

const agentDir = () => mkdtempSync(join(tmpdir(), "seed-agent-"));

describe("sandbox self-seed", () => {
	test("one project of every repository, one workspace checking them all out at <root>/<path>", () => {
		const db = createDb();
		const seed = identity(["web", "api"]);

		runSandboxSelfSeed(db, seed, agentDir());
		runSandboxSelfSeed(db, seed, agentDir());

		const [project, ...others] = db.select().from(schema.projects).all();
		expect(others).toHaveLength(0);
		const repositories = listProjectRepositories(db, project?.id ?? "");
		expect(repositories.map((r) => [r.name, r.repoPath, r.owner])).toEqual([
			["api", "/workspace/api", "acme"],
			["web", "/workspace/web", "acme"],
		]);
		expect(project?.primaryRepositoryId).toBe(
			repositories.find((r) => r.name === "web")?.id as string,
		);
		expect(db.select().from(schema.workspaces).all()).toMatchObject([
			{ id: WORKSPACE_ID, worktreePath: "/workspace", type: "local" },
		]);
		const web = repositories.find((r) => r.name === "web");
		expect(resolveCheckout(db, WORKSPACE_ID, web?.id).path).toBe(
			"/workspace/web",
		);
	});

	test("a box of several repositories gets the root AGENTS.md at once", () => {
		const db = createDb();
		const root = mkdtempSync(join(tmpdir(), "seed-root-"));
		for (const path of ["web", "api"]) mkdirSync(join(root, path));

		runSandboxSelfSeed(db, identity(["web", "api"], root), agentDir());

		const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
		expect(agents).toContain(`| web | ${join(root, "web")} | feat |`);
		expect(agents).toContain(`| api | ${join(root, "api")} | feat |`);
		rmSync(root, { recursive: true, force: true });
	});

	test("a box seeded before its clones exist gets the root files once the checkouts are in", async () => {
		const db = createDb();
		const parent = mkdtempSync(join(tmpdir(), "seed-root-"));
		const root = join(parent, "workspace");
		const seed = identity(["web", "api"], root);

		runSandboxSelfSeed(db, seed, agentDir());
		for (const path of ["web", "api"])
			mkdirSync(join(root, path), { recursive: true });
		writeFileSync(join(root, "web", "AGENTS.md"), "web rules\n");
		await runSandboxStartHook(
			{ db } as Parameters<typeof runSandboxStartHook>[0],
			seed,
			{
				files: {
					marker: join(parent, "start-hook.pid"),
					log: join(parent, "start-hook.log"),
					runTerminal: join(parent, "start-hook-run-terminal"),
				},
			},
		);

		const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
		expect(agents).toContain(`- web: ${join(root, "web", "AGENTS.md")}`);
		rmSync(parent, { recursive: true, force: true });
	});

	test("a lone repository at the root is the workspace folder, named after the repo", () => {
		const db = createDb();

		runSandboxSelfSeed(db, identity(["."]), agentDir());

		expect(resolveCheckout(db, WORKSPACE_ID).path).toBe("/workspace");
		expect(db.select().from(schema.repositories).all()).toMatchObject([
			{ name: "solo", repoPath: "/workspace" },
		]);
	});

	test("a box seeded before multi-repo folds its sibling projects into the primary's", () => {
		const db = createDb();
		const primary = seedProject(
			{ db },
			{ repoPath: "/workspace/web", repositoryName: "web" },
		);
		seedWorkspace(
			{ db },
			{
				id: WORKSPACE_ID,
				projectId: primary.id,
				worktreePath: "/workspace/web",
				branch: "feat",
				type: "local",
			},
		);
		const sibling = seedProject(
			{ db },
			{ repoPath: "/workspace/api", repositoryName: "api" },
		);
		seedWorkspace(
			{ db },
			{
				projectId: sibling.id,
				worktreePath: "/workspace/api",
				branch: "feat",
				type: "local",
			},
		);

		runSandboxSelfSeed(db, identity(["web", "api"]), agentDir());

		expect(
			db
				.select()
				.from(schema.projects)
				.all()
				.map((p) => p.id),
		).toEqual([primary.id]);
		expect(
			listProjectRepositories(db, primary.id)
				.map((r) => r.id)
				.sort(),
		).toEqual([primary.repositoryId, sibling.repositoryId].sort());
		expect(db.select().from(schema.workspaces).all()).toMatchObject([
			{ id: WORKSPACE_ID, worktreePath: "/workspace" },
		]);
		expect(resolveCheckout(db, WORKSPACE_ID, sibling.repositoryId).path).toBe(
			"/workspace/api",
		);
	});
});
