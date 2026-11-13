import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { seedProject, seedWorkspace } from "../../test/helpers/seed";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	getLiveRepositoryAtPath,
	listProjectRepositories,
} from "../projects/repositories";
import {
	listCheckoutsByWorkspaceId,
	listWorkspaceCheckouts,
	resolveCheckout,
} from "./checkouts";

function createDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	runMigrations(db, resolve(import.meta.dir, "../../drizzle"));
	return db as unknown as HostDb;
}

function trpcError(fn: () => unknown): TRPCError {
	try {
		fn();
	} catch (error) {
		if (error instanceof TRPCError) return error;
		throw error;
	}
	throw new Error("expected a TRPCError");
}

describe("checkouts", () => {
	test("a single-repo workspace's checkout is the workspace folder, and git needs no repository id", () => {
		const db = createDb();
		const project = seedProject({ db }, { repoPath: "/src/api" });
		const workspace = seedWorkspace(
			{ db },
			{ projectId: project.id, worktreePath: "/wt/feat", branch: "feat" },
		);

		const resolved = resolveCheckout(db, workspace.id);

		expect(resolved.path).toBe("/wt/feat");
		expect(resolved.repository?.id).toBe(project.repositoryId);
	});

	test("a multi-repo workspace puts each checkout under the root by name, sorted by name", () => {
		const db = createDb();
		const project = seedProject(
			{ db },
			{
				repoPath: "/src/web",
				repoName: "web",
				repositories: [{ repoPath: "/src/api", repoName: "api" }],
			},
		);
		const workspace = seedWorkspace(
			{ db },
			{ projectId: project.id, worktreePath: "/wt/root", branch: "feat" },
		);

		expect(
			listWorkspaceCheckouts(db, { id: workspace.id, worktreePath: "/wt/root" }).map(
				(c) => [c.repository.name, c.path],
			),
		).toEqual([
			["api", "/wt/root/api"],
			["web", "/wt/root/web"],
		]);
		expect(
			listCheckoutsByWorkspaceId(db, [
				{ id: workspace.id, worktreePath: "/wt/root" },
			])
				.get(workspace.id)
				?.map((c) => c.path),
		).toEqual(["/wt/root/api", "/wt/root/web"]);
		expect(resolveCheckout(db, workspace.id, project.repositoryId).path).toBe(
			"/wt/root/web",
		);
	});

	test("git without a repository id on a multi-repo workspace is refused, naming the choice", () => {
		const db = createDb();
		const project = seedProject(
			{ db },
			{
				repoPath: "/src/web",
				repositories: [{ repoPath: "/src/api" }],
			},
		);
		const workspace = seedWorkspace(
			{ db },
			{ projectId: project.id, worktreePath: "/wt/root", branch: "feat" },
		);

		const missing = trpcError(() => resolveCheckout(db, workspace.id));
		expect(missing.code).toBe("BAD_REQUEST");
		expect(missing.message).toContain("repository_required");
		expect(missing.message).toContain("api=");

		const unknown = trpcError(() =>
			resolveCheckout(db, workspace.id, "not-a-repository"),
		);
		expect(unknown.code).toBe("NOT_FOUND");
		expect(unknown.message).toContain("checkout_not_found");
	});

	test("a session workspace resolves to its own folder", () => {
		const db = createDb();
		db.insert(schema.workspaces)
			.values({
				id: "s1",
				projectId: null,
				worktreePath: "/sessions/s1",
				branch: "main",
				type: "session",
			})
			.run();

		const resolved = resolveCheckout(db, "s1");

		expect(resolved.path).toBe("/sessions/s1");
		expect(resolved.repository).toBeNull();
	});
});

describe("repositories", () => {
	test("a project's repositories are sorted by name; a deleted project's path is free", () => {
		const db = createDb();
		const project = seedProject(
			{ db },
			{
				repoPath: "/src/web",
				repoName: "web",
				repositories: [{ repoPath: "/src/api", repoName: "api" }],
			},
		);

		expect(listProjectRepositories(db, project.id).map((r) => r.name)).toEqual([
			"api",
			"web",
		]);
		expect(getLiveRepositoryAtPath(db, "/src/api")?.projectId).toBe(project.id);

		db.update(schema.projects)
			.set({ deletedAt: 1 })
			.where(eq(schema.projects.id, project.id))
			.run();
		expect(getLiveRepositoryAtPath(db, "/src/api")).toBeUndefined();
	});
});
