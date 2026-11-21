import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects, workspaces } from "../db/schema";
import { WorkspaceFilesystemManager } from "../runtime/filesystem/filesystem";
import { createUserSimpleGit } from "../runtime/git/simple-git";
import { hasTagFolderScope } from "../tag-folders";
import { createCallerFactory } from "../trpc/index";
import { configRouter } from "../trpc/router/config";
import { createFromImportLocal } from "../trpc/router/project/handlers";
import { projectRouter } from "../trpc/router/project/project";
import { tagFoldersRouter } from "../trpc/router/tag-folders/tag-folders";
import { isLocalCheckoutWorkspace } from "../trpc/router/workspace-cleanup/is-local-checkout-workspace";
import { requireLocalProject } from "../trpc/router/workspace-creation/shared/local-project";
import { resolveGithubRepo } from "../trpc/router/workspace-creation/shared/project-helpers";
import type { HostServiceContext } from "../types";
import { insertLocalWorkspace } from "../workspaces/local-workspace-store";
import {
	getLiveProjectAtPath,
	getLocalProject,
	getProjectAtPathIncludingDeleted,
	getProjectIncludingDeleted,
} from "./local-project-store";

const SRC = resolve(import.meta.dir, "..");
const MIGRATIONS_FOLDER = resolve(SRC, "../drizzle");

const tempDirs: string[] = [];
afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "deleted-project-"));
	tempDirs.push(dir);
	return dir;
}

async function createRepo(): Promise<string> {
	const git = createUserSimpleGit(tempDir());
	await git.init();
	await git.addConfig("user.email", "test@test.local");
	await git.addConfig("user.name", "Test");
	await git.addRemote("origin", "https://github.com/acme/demo.git");
	await git.raw(["commit", "--allow-empty", "-m", "init"]);
	return (await git.revparse(["--show-toplevel"])).trim();
}

async function setUp() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const ctx = {
		db: db as unknown as HostDb,
		api: { analytics: { captureEvent: { mutate: async () => {} } } },
		eventBus: new Proxy({}, { get: () => () => {} }),
		git: async (path: string) => createUserSimpleGit(path),
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext;
	const repo = await createRepo();
	const { projectId } = await createFromImportLocal(ctx, {
		name: "Demo",
		repoPath: repo,
	});
	const worktree = insertLocalWorkspace(ctx, {
		projectId,
		worktreePath: tempDir(),
		branch: "feature",
		name: "feature",
	});
	return {
		ctx,
		repo,
		projectId,
		worktreeId: worktree.id,
		project: createCallerFactory(projectRouter)(ctx),
		config: createCallerFactory(configRouter)(ctx),
		tagFolders: createCallerFactory(tagFoldersRouter)(ctx),
		filesystem: new WorkspaceFilesystemManager({ db: ctx.db }),
	};
}

type Env = Awaited<ReturnType<typeof setUp>>;

const NOT_SET_UP = /not set up|not found/i;

const liveOnly: Record<string, (env: Env) => unknown> = {
	"project.update": (e) =>
		e.project.update({ projectId: e.projectId, name: "Renamed" }),
	"project.setIcon": (e) =>
		e.project.setIcon({ projectId: e.projectId, icon: "none" }),
	"project.setColor": (e) =>
		e.project.setColor({ projectId: e.projectId, color: "#112233" }),
	"project.setWorktreeBaseDir": (e) =>
		e.project.setWorktreeBaseDir({ projectId: e.projectId, path: "/tmp/wt" }),
	"project.setNamingInstructions": (e) =>
		e.project.setNamingInstructions({
			projectId: e.projectId,
			instructions: "use ticket ids",
		}),
	"project.setSparseCheckoutPaths": (e) =>
		e.project.setSparseCheckoutPaths({
			projectId: e.projectId,
			paths: ["apps"],
		}),
	"project.setBranchPrefix": (e) =>
		e.project.setBranchPrefix({ projectId: e.projectId, mode: "none" }),
	"project.setTagSetting": (e) =>
		e.project.setTagSetting({ projectId: e.projectId, tag: "bugs" }),
	"project.deleteTagSetting": (e) =>
		e.project.deleteTagSetting({ projectId: e.projectId, tag: "bugs" }),
	"tagFolders.upsert": (e) =>
		e.tagFolders.upsert({ scope: e.projectId, tag: "bugs", color: "red" }),
	"tagFolders.delete": (e) =>
		e.tagFolders.delete({ scope: e.projectId, tag: "bugs" }),
	"config.shouldShowSetupCard": (e) =>
		e.config.shouldShowSetupCard({ projectId: e.projectId }),
	"config.getConfigContent": (e) =>
		e.config.getConfigContent({ projectId: e.projectId }),
	"config.updateConfig": (e) =>
		e.config.updateConfig({ projectId: e.projectId, setup: ["true"] }),
	"config.getConfigFiles": (e) =>
		e.config.getConfigFiles({ projectId: e.projectId }),
	"config.getWorkspaceRunDefinition": (e) =>
		e.config.getWorkspaceRunDefinition({ projectId: e.projectId }),
	requireLocalProject: (e) => requireLocalProject(e.ctx, e.projectId),
	resolveGithubRepo: (e) => resolveGithubRepo(e.ctx, e.projectId),
	"filesystem.resolveProjectRoot": (e) =>
		e.filesystem.resolveProjectRoot(e.projectId),
};

async function settle(fn: () => unknown) {
	try {
		await fn();
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

describe("a deleted project is hidden from live-only lookups", () => {
	for (const [name, call] of Object.entries(liveOnly)) {
		it(`${name}: works live, refuses deleted, works again after restore`, async () => {
			const env = await setUp();
			expect(await settle(() => call(env))).toBeNull();

			await env.project.remove({ projectId: env.projectId });
			expect(await settle(() => call(env))).toMatch(NOT_SET_UP);

			await env.project.restore({ projectId: env.projectId });
			expect(await settle(() => call(env))).toBeNull();
		});
	}

	it("settings writes leave a deleted project untouched", async () => {
		const env = await setUp();
		await env.project.remove({ projectId: env.projectId });
		const before = getProjectIncludingDeleted(env.ctx.db, env.projectId);
		for (const call of Object.values(liveOnly)) await settle(() => call(env));
		expect(getProjectIncludingDeleted(env.ctx.db, env.projectId)).toEqual(
			before,
		);
		expect(hasTagFolderScope(env.ctx.db, env.projectId)).toBe(false);
	});

	it("project.get and project.list skip it", async () => {
		const env = await setUp();
		await env.project.remove({ projectId: env.projectId });
		expect(await env.project.get({ projectId: env.projectId })).toBeNull();
		expect(await env.project.list()).toEqual([]);
	});
});

describe("lookups that must still see a deleted project", () => {
	it("remove is idempotent and keeps reporting the repo path", async () => {
		const env = await setUp();
		const first = await env.project.remove({ projectId: env.projectId });
		const second = await env.project.remove({ projectId: env.projectId });
		expect(first.repoPath).toBe(env.repo);
		expect(second.repoPath).toBe(env.repo);
	});

	it("restore brings back the project and the workspaces deleted with it", async () => {
		const env = await setUp();
		await env.project.remove({ projectId: env.projectId });
		const restored = await env.project.restore({ projectId: env.projectId });
		expect(restored.restoredWorkspaceCount).toBe(1);
		const row = env.ctx.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, env.worktreeId))
			.get();
		expect(row?.archivedAt).toBeNull();
	});

	it("listDeleted and purge find it", async () => {
		const env = await setUp();
		await env.project.remove({ projectId: env.projectId });
		const deleted = await env.project.listDeleted();
		expect(deleted.map((row) => row.id)).toEqual([env.projectId]);
		await env.project.purge({ projectId: env.projectId });
		expect(
			getProjectIncludingDeleted(env.ctx.db, env.projectId),
		).toBeUndefined();
	});

	it("setup of the deleted project's own id restores it in place", async () => {
		const env = await setUp();
		await env.project.remove({ projectId: env.projectId });
		const result = await env.project.setup({
			projectId: env.projectId,
			mode: { kind: "import", repoPath: env.repo },
		});
		expect(result.repoPath).toBe(env.repo);
		expect(getLocalProject(env.ctx.db, env.projectId)?.name).toBe("Demo");
	});

	it("importLocal of the same folder revives the deleted project", async () => {
		const env = await setUp();
		await env.project.remove({ projectId: env.projectId });
		const again = await createFromImportLocal(env.ctx, {
			name: "Other",
			repoPath: env.repo,
		});
		expect(again).toMatchObject({ projectId: env.projectId, created: false });
		expect(getLocalProject(env.ctx.db, env.projectId)?.name).toBe("Demo");
	});

	it("workspace checks still resolve the project's checkout", async () => {
		const env = await setUp();
		await env.project.remove({ projectId: env.projectId });
		const result = await isLocalCheckoutWorkspace(env.ctx, env.worktreeId);
		expect(result.project?.repoPath).toBe(env.repo);
	});

	it("path lookups tell live and deleted rows apart", async () => {
		const env = await setUp();
		await env.project.remove({ projectId: env.projectId });
		expect(getLiveProjectAtPath(env.ctx.db, env.repo)).toBeUndefined();
		expect(getProjectAtPathIncludingDeleted(env.ctx.db, env.repo)?.id).toBe(
			env.projectId,
		);
		expect(
			env.ctx.db
				.select()
				.from(projects)
				.where(eq(projects.id, env.projectId))
				.get()?.deletedAt,
		).not.toBeNull();
	});
});

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
	});
}

it("single-project lookups go through local-project-store", () => {
	const offenders = sourceFiles(SRC)
		.filter((path) => !path.endsWith("projects/local-project-store.ts"))
		.filter((path) => /\.query\.projects\b/.test(readFileSync(path, "utf-8")))
		.map((path) => relative(SRC, path));
	expect(offenders).toEqual([]);
});
