import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import type { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { projects, workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { workspaceRouter } from "./workspace";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function setup(project: { repoName?: string; name?: string }) {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(projects)
		.values({
			id: "project-1",
			repoPath: "/tmp/acme",
			updatedAt: 1,
			...project,
		})
		.run();
	db.insert(workspaces)
		.values({
			id: "ws-1",
			projectId: "project-1",
			worktreePath: "/tmp/worktrees/feature-x",
			branch: "feature-x",
			createdAt: 1,
			updatedAt: 1,
		})
		.run();
	return createCallerFactory(workspaceRouter)({
		db: db as unknown as HostDb,
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext);
}

describe("workspace.repositories", () => {
	it("returns the workspace's one repository at its root", async () => {
		const caller = setup({ repoName: "acme", name: "Acme Web" });

		expect(await caller.repositories({ workspaceId: "ws-1" })).toEqual([
			{ id: "ws-1", path: ".", name: "acme", primary: true },
		]);
	});

	it("names the repository after the project when it has no repo name", async () => {
		const caller = setup({ name: "Acme Web" });

		const [repository] = await caller.repositories({ workspaceId: "ws-1" });
		expect(repository?.name).toBe("Acme Web");
	});

	it("reports an unknown workspace as not found", async () => {
		const caller = setup({ repoName: "acme" });

		const error = (await caller
			.repositories({ workspaceId: "missing" })
			.catch((thrown: unknown) => thrown)) as TRPCError;
		expect(error.code).toBe("NOT_FOUND");
	});
});
