import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { seedProject } from "../../../../test/helpers/seed";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { projectRouter } from "./project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

describe("project.get", () => {
	it("reports whether each repository folder is still on disk", async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema }) as unknown as HostDb;
		migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
		const repoPath = mkdtempSync(join(tmpdir(), "project-get-test-"));
		const project = seedProject(
			{ db },
			{ repoPath, name: "acme-web", repositories: [{ repoPath: "/gone/api" }] },
		);
		const caller = createCallerFactory(projectRouter)({
			db,
			isAuthenticated: true,
			organizationId: "org-test",
		} as unknown as HostServiceContext);

		const states = async () =>
			Object.fromEntries(
				((await caller.get({ projectId: project.id }))?.repositories ?? []).map(
					(r) => [r.path, r.pathState],
				),
			);
		expect(await states()).toEqual({
			[repoPath]: "ok",
			"/gone/api": "missing",
		});
		rmSync(repoPath, { recursive: true, force: true });
		expect((await states())[repoPath]).toBe("missing");
	});

	it("returns a deleted project, marked deleted, only with includeDeleted", async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema }) as unknown as HostDb;
		migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
		const project = seedProject({ db }, { repoPath: "/code/api", name: "api" });
		const caller = createCallerFactory(projectRouter)({
			db,
			isAuthenticated: true,
			organizationId: "org-test",
		} as unknown as HostServiceContext);
		const asked = () =>
			caller.get({ projectId: project.id, includeDeleted: true });
		expect((await asked())?.deleted).toBe(false);

		db.update(schema.projects)
			.set({ deletedAt: Date.now() })
			.where(eq(schema.projects.id, project.id))
			.run();

		expect(await caller.get({ projectId: project.id })).toBeNull();
		const deleted = await asked();
		expect(deleted?.deleted).toBe(true);
		expect(deleted?.repositories.map((r) => r.path)).toEqual(["/code/api"]);
	});
});
