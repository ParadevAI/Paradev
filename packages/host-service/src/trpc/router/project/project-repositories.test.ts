import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { seedPullRequest, seedWorkspace } from "../../../../test/helpers/seed";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { projectRouter } from "./project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const root = mkdtempSync(join(tmpdir(), "project-repositories-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function gitRepo(
	name: string,
	parent = mkdtempSync(join(root, "case-")),
) {
	const dir = join(parent, name);
	mkdirSync(dir, { recursive: true });
	const git = createUserSimpleGit(dir);
	await git.init(["--initial-branch=main"]);
	await git.addConfig("user.email", "test@test.local");
	await git.addConfig("user.name", "Test");
	await git.raw(["commit", "--allow-empty", "-m", "init"]);
	return (await git.revparse(["--show-toplevel"])).trim();
}

function setup() {
	const sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	const events: string[] = [];
	const eventBus = new Proxy(
		{},
		{
			get: (_, name) => (message: { eventType?: string }) =>
				events.push(`${String(name)}:${message?.eventType ?? ""}`),
		},
	);
	const ctx = {
		db,
		eventBus,
		isAuthenticated: true,
		organizationId: "org-test",
		git: async (path: string) => createUserSimpleGit(path),
	} as unknown as HostServiceContext;
	return { db, events, caller: createCallerFactory(projectRouter)(ctx) };
}

const local = (path: string) => ({ kind: "local" as const, path });

describe("project repositories", () => {
	it("creates a project of several repositories, the first primary, sorted by name", async () => {
		const { caller, events } = setup();
		const web = await gitRepo("web");
		const api = await gitRepo("api");

		const project = await caller.create({
			name: "Acme",
			repositories: [local(web), local(api)],
		});

		expect(project.created).toBe(true);
		expect(project.repositories.map((r) => [r.name, r.isPrimary])).toEqual([
			["api", false],
			["web", true],
		]);
		expect(project.primaryRepositoryId).toBe(
			project.repositories.find((r) => r.path === web)?.id as string,
		);
		expect(events).toContain("broadcastProjectChanged:created");
		expect((await caller.list()).map((p) => p.id)).toEqual([project.id]);
	});

	it("refuses two repositories with the same folder name, and a repository another project has", async () => {
		const { caller } = setup();
		const a = await gitRepo("web");
		const b = await gitRepo("web");

		await expect(
			caller.create({ name: "Dup", repositories: [local(a), local(b)] }),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: expect.stringContaining("duplicate_name"),
		});

		const owner = await caller.create({
			name: "Owner",
			repositories: [local(a)],
		});
		await expect(
			caller.create({
				name: "Taken",
				repositories: [local(a), local(await gitRepo("api"))],
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: expect.stringContaining("repository_taken"),
		});
		await expect(
			caller.addRepository({ projectId: owner.id, source: local(b) }),
		).rejects.toMatchObject({
			message: expect.stringContaining("duplicate_name"),
		});
	});

	it("removes every repository it created when one source fails", async () => {
		const { caller, db } = setup();
		const parentDir = mkdtempSync(join(root, "parent-"));

		await expect(
			caller.create({
				name: "Half",
				parentDir,
				repositories: [
					{ kind: "empty", name: "fresh" },
					local(join(parentDir, "not-there")),
				],
			}),
		).rejects.toBeDefined();

		expect(existsSync(join(parentDir, "fresh"))).toBe(false);
		expect(db.select().from(schema.projects).all()).toHaveLength(0);
	});

	it("adds a repository without giving live workspaces a checkout of it", async () => {
		const { caller, db } = setup();
		const project = await caller.create({
			name: "Acme",
			repositories: [local(await gitRepo("web"))],
		});
		const workspace = seedWorkspace(
			{ db },
			{ projectId: project.id, worktreePath: "/wt/feat", branch: "feat" },
		);

		const updated = await caller.addRepository({
			projectId: project.id,
			source: local(await gitRepo("api")),
		});

		expect(updated.repositories.map((r) => r.name)).toEqual(["api", "web"]);
		expect(
			db
				.select()
				.from(schema.workspaceRepositories)
				.all()
				.filter((row) => row.workspaceId === workspace.id),
		).toHaveLength(1);
	});

	it("refuses to remove the primary or a repository a workspace checks out, archived or not", async () => {
		const { caller, db } = setup();
		const project = await caller.create({
			name: "Acme",
			repositories: [local(await gitRepo("web")), local(await gitRepo("api"))],
		});
		const api = project.repositories.find((r) => r.name === "api");
		if (!api) throw new Error("no api repository");
		const workspace = seedWorkspace(
			{ db },
			{ projectId: project.id, worktreePath: "/wt/feat", branch: "feat" },
		);
		db.update(schema.workspaces).set({ archivedAt: 1 }).run();

		await expect(
			caller.removeRepository({
				projectId: project.id,
				repositoryId: project.primaryRepositoryId,
			}),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: expect.stringContaining("primary_repository"),
		});
		await expect(
			caller.removeRepository({ projectId: project.id, repositoryId: api.id }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: expect.stringContaining("1 archived"),
		});

		db.delete(schema.workspaces).run();
		const after = await caller.removeRepository({
			projectId: project.id,
			repositoryId: api.id,
		});
		expect(after.repositories.map((r) => r.name)).toEqual(["web"]);
		expect(existsSync(api.path)).toBe(true);
		expect(workspace.id).toBeDefined();
	});

	it("moves the primary mark, and relocates a repository keeping its name", async () => {
		const { caller } = setup();
		const project = await caller.create({
			name: "Acme",
			repositories: [local(await gitRepo("web")), local(await gitRepo("api"))],
		});
		const api = project.repositories.find((r) => r.name === "api");
		if (!api) throw new Error("no api repository");

		const switched = await caller.setPrimaryRepository({
			projectId: project.id,
			repositoryId: api.id,
		});
		expect(switched.primaryRepositoryId).toBe(api.id);

		const moved = await gitRepo("api-moved");
		const relocated = await caller.relocateRepository({
			projectId: project.id,
			repositoryId: api.id,
			path: moved,
		});
		expect(relocated.repositories.find((r) => r.id === api.id)).toMatchObject({
			name: "api",
			path: moved,
		});
	});

	it("sets sparse checkout paths per repository", async () => {
		const { caller } = setup();
		const project = await caller.create({
			name: "Acme",
			repositories: [local(await gitRepo("web")), local(await gitRepo("api"))],
		});

		await caller.setSparseCheckoutPaths({
			projectId: project.id,
			repositoryId: project.primaryRepositoryId,
			paths: ["apps/web"],
		});

		const after = await caller.get({ projectId: project.id });
		expect(
			after?.repositories.map((r) => [r.name, r.sparseCheckoutPaths]),
		).toEqual([
			["api", []],
			["web", ["apps/web"]],
		]);
	});
});

describe("removing a repository", () => {
	it("moves its pull requests to another clone of the same GitHub repository", async () => {
		const { caller, db } = setup();
		const a = await caller.create({
			name: "A",
			repositories: [local(await gitRepo("web")), local(await gitRepo("api"))],
		});
		const apiA = a.repositories.find((r) => r.name === "api");
		if (!apiA) throw new Error("no api repository");
		const b = await caller.create({
			name: "B",
			repositories: [local(await gitRepo("api"))],
		});
		for (const id of [apiA.id, b.primaryRepositoryId]) {
			db.update(schema.repositories)
				.set({ owner: "acme", repoName: "api" })
				.where(eq(schema.repositories.id, id))
				.run();
		}
		const pr = seedPullRequest(
			{ db },
			{ repositoryId: apiA.id, prNumber: 1, headBranch: "feat" },
		);

		await caller.removeRepository({ projectId: a.id, repositoryId: apiA.id });

		expect(
			db
				.select()
				.from(schema.pullRequests)
				.where(eq(schema.pullRequests.id, pr.id))
				.get()?.repositoryId,
		).toBe(b.primaryRepositoryId);
	});
});
