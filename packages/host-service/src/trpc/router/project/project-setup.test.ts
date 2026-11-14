import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
	copyGitFixture,
	createGitFixture,
	type GitFixture,
} from "../../../../test/helpers/git-fixture";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { projectRouter } from "./project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

let template: GitFixture;
const fixtures: GitFixture[] = [];
const root = realpathSync(mkdtempSync(join(tmpdir(), "project-setup-")));
beforeAll(async () => {
	template = await createGitFixture();
});
afterAll(() => {
	template.dispose();
	for (const fixture of fixtures) fixture.dispose();
	rmSync(root, { recursive: true, force: true });
});

async function repo(remote?: string): Promise<string> {
	const fixture = copyGitFixture(template);
	fixtures.push(fixture);
	if (remote) await fixture.git.addRemote("origin", remote);
	return fixture.repoPath;
}

function setup(api: unknown = {}) {
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
		api,
		eventBus,
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext;
	return { db, events, caller: createCallerFactory(projectRouter)(ctx) };
}

function origin(repositories: { name: string; url: string | null }[]) {
	const withIds = repositories.map((r) => ({ id: randomUUID(), ...r }));
	return {
		projectId: randomUUID(),
		origin: {
			name: "Acme",
			primaryRepositoryId: withIds[0]?.id as string,
			repositories: withIds,
		},
		ids: withIds.map((r) => r.id),
	};
}

describe("project.setup", () => {
	it("sets up a project from another host with its project and repository ids", async () => {
		const { caller, events } = setup();
		const source = await repo();
		const web = await repo("https://github.com/acme/web.git");
		const {
			projectId,
			origin: from,
			ids,
		} = origin([
			{ name: "api", url: source },
			{ name: "web", url: "https://github.com/acme/web" },
		]);
		const parentDir = join(root, "fresh");

		const project = await caller.setup({
			projectId,
			origin: from,
			repositories: [
				{ id: ids[0] as string, mode: { kind: "clone", parentDir } },
				{ id: ids[1] as string, mode: { kind: "import", path: web } },
			],
		});

		expect(project.created).toBe(true);
		expect(project.id).toBe(projectId);
		expect(project.name).toBe("Acme");
		expect(project.primaryRepositoryId).toBe(ids[0] as string);
		expect(project.repositories.map((r) => [r.id, r.name, r.path])).toEqual([
			[ids[0] as string, "api", join(parentDir, basename(source))],
			[ids[1] as string, "web", web],
		]);
		expect(events).toContain("broadcastProjectChanged:created");
	});

	it("is a no-op when every repository is already where the call says", async () => {
		const { caller } = setup();
		const web = await repo();
		const {
			projectId,
			origin: from,
			ids,
		} = origin([{ name: "web", url: null }]);
		const input = {
			projectId,
			origin: from,
			repositories: [
				{ id: ids[0] as string, mode: { kind: "import" as const, path: web } },
			],
		};
		await caller.setup(input);

		const again = await caller.setup(input);

		expect(again.created).toBe(false);
		expect(again.repositories.map((r) => r.path)).toEqual([web]);
	});

	it("refuses another folder for a placed repository unless asked to relocate", async () => {
		const { caller } = setup();
		const first = await repo();
		const moved = await repo();
		const {
			projectId,
			origin: from,
			ids,
		} = origin([{ name: "web", url: null }]);
		const id = ids[0] as string;
		await caller.setup({
			projectId,
			origin: from,
			repositories: [{ id, mode: { kind: "import", path: first } }],
		});

		await expect(
			caller.setup({
				projectId,
				repositories: [{ id, mode: { kind: "import", path: moved } }],
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: expect.stringContaining("already_set_up"),
		});
		const relocated = await caller.setup({
			projectId,
			repositories: [
				{ id, mode: { kind: "import", path: moved, allowRelocate: true } },
			],
		});
		expect(relocated.repositories.map((r) => r.path)).toEqual([moved]);
	});

	it("refuses a set-up that leaves a repository without a folder", async () => {
		const { caller } = setup();
		const web = await repo();
		const {
			projectId,
			origin: from,
			ids,
		} = origin([
			{ name: "web", url: null },
			{ name: "api", url: null },
		]);

		await expect(
			caller.setup({
				projectId,
				origin: from,
				repositories: [
					{ id: ids[0] as string, mode: { kind: "import", path: web } },
				],
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining(
				"repository_unplaced: pick a folder for api",
			),
		});
		expect(await caller.list()).toEqual([]);
	});

	it("refuses a folder whose remote is another repository", async () => {
		const { caller } = setup();
		const other = await repo("https://github.com/acme/other.git");
		const {
			projectId,
			origin: from,
			ids,
		} = origin([{ name: "web", url: "https://github.com/acme/web" }]);

		await expect(
			caller.setup({
				projectId,
				origin: from,
				repositories: [
					{ id: ids[0] as string, mode: { kind: "import", path: other } },
				],
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("No remote matches acme/web"),
		});
	});

	it("a refused set-up leaves a deleted project deleted", async () => {
		const { caller, db } = setup();
		const web = await repo();
		const other = await repo();
		const {
			projectId,
			origin: from,
			ids,
		} = origin([{ name: "web", url: null }]);
		const id = ids[0] as string;
		await caller.setup({
			projectId,
			origin: from,
			repositories: [{ id, mode: { kind: "import", path: web } }],
		});
		db.update(schema.projects)
			.set({ deletedAt: Date.now() })
			.where(eq(schema.projects.id, projectId))
			.run();

		await expect(
			caller.setup({
				projectId,
				repositories: [{ id, mode: { kind: "import", path: other } }],
			}),
		).rejects.toMatchObject({
			message: expect.stringContaining("already_set_up"),
		});
		await expect(
			caller.setup({
				projectId,
				repositories: [
					{ id: randomUUID(), mode: { kind: "import", path: web } },
				],
			}),
		).rejects.toMatchObject({
			message: expect.stringContaining("repository_not_found"),
		});
		expect(await caller.list()).toEqual([]);
	});

	it("brings a deleted project back in a new folder when another project took its old one", async () => {
		const { caller, db } = setup();
		const web = await repo();
		const moved = await repo();
		const first = origin([{ name: "web", url: null }]);
		const second = origin([{ name: "web", url: null }]);
		const id = first.ids[0] as string;
		await caller.setup({
			projectId: first.projectId,
			origin: first.origin,
			repositories: [{ id, mode: { kind: "import", path: web } }],
		});
		db.update(schema.projects)
			.set({ deletedAt: Date.now() })
			.where(eq(schema.projects.id, first.projectId))
			.run();
		await caller.setup({
			projectId: second.projectId,
			origin: second.origin,
			repositories: [
				{ id: second.ids[0] as string, mode: { kind: "import", path: web } },
			],
		});

		await expect(
			caller.setup({
				projectId: first.projectId,
				repositories: [{ id, mode: { kind: "import", path: web } }],
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: expect.stringContaining("repository_taken"),
		});
		const back = await caller.setup({
			projectId: first.projectId,
			repositories: [
				{ id, mode: { kind: "import", path: moved, allowRelocate: true } },
			],
		});

		expect(back.repositories.map((r) => r.path)).toEqual([moved]);
		expect((await caller.list()).map((p) => p.id).sort()).toEqual(
			[first.projectId, second.projectId].sort(),
		);
	});

	it("moves every placed repository or none of them", async () => {
		const { caller } = setup();
		const [web, api, webMoved, apiMoved] = await Promise.all([
			repo(),
			repo(),
			repo(),
			repo(),
		]);
		const notARepository = mkdtempSync(join(root, "plain-"));
		const {
			projectId,
			origin: from,
			ids,
		} = origin([
			{ name: "web", url: null },
			{ name: "api", url: null },
		]);
		const [webId, apiId] = ids as [string, string];
		await caller.setup({
			projectId,
			origin: from,
			repositories: [
				{ id: webId, mode: { kind: "import", path: web } },
				{ id: apiId, mode: { kind: "import", path: api } },
			],
		});
		const paths = async () =>
			(await caller.get({ projectId }))?.repositories.map((r) => [
				r.id,
				r.path,
			]);

		await expect(
			caller.setup({
				projectId,
				repositories: [
					{
						id: webId,
						mode: { kind: "import", path: webMoved, allowRelocate: true },
					},
					{
						id: apiId,
						mode: { kind: "import", path: notARepository, allowRelocate: true },
					},
				],
			}),
		).rejects.toThrow();
		expect(await paths()).toEqual([
			[apiId, api],
			[webId, web],
		]);

		await expect(
			caller.setup({
				projectId,
				repositories: [
					{
						id: webId,
						mode: { kind: "import", path: api, allowRelocate: true },
					},
				],
			}),
		).rejects.toMatchObject({
			message: expect.stringContaining("repository_taken"),
		});

		await caller.setup({
			projectId,
			repositories: [
				{
					id: webId,
					mode: { kind: "import", path: webMoved, allowRelocate: true },
				},
				{
					id: apiId,
					mode: { kind: "import", path: apiMoved, allowRelocate: true },
				},
			],
		});
		expect(await paths()).toEqual([
			[apiId, apiMoved],
			[webId, webMoved],
		]);
	});

	it("two set-ups of one new project at once: one wins, the other is a CONFLICT", async () => {
		const { caller } = setup();
		const [a, b] = await Promise.all([repo(), repo()]);
		const {
			projectId,
			origin: from,
			ids,
		} = origin([{ name: "web", url: null }]);
		const id = ids[0] as string;

		const results = await Promise.allSettled(
			[a, b].map((path) =>
				caller.setup({
					projectId,
					origin: from,
					repositories: [{ id, mode: { kind: "import", path } }],
				}),
			),
		);

		expect(results.map((r) => r.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
		expect(results.find((r) => r.status === "rejected")).toMatchObject({
			reason: {
				code: "CONFLICT",
				message: expect.stringContaining("repository_id_taken"),
			},
		});
	});

	it("a stored path with a trailing slash is the same folder", async () => {
		const { caller, db } = setup();
		const web = await repo();
		const {
			projectId,
			origin: from,
			ids,
		} = origin([{ name: "web", url: null }]);
		const id = ids[0] as string;
		await caller.setup({
			projectId,
			origin: from,
			repositories: [{ id, mode: { kind: "import", path: web } }],
		});
		db.update(schema.repositories)
			.set({ repoPath: `${web}/` })
			.where(eq(schema.repositories.id, id))
			.run();

		for (const mode of [
			{ kind: "clone" as const, parentDir: `${dirname(web)}/` },
			{ kind: "import" as const, path: web },
		]) {
			const again = await caller.setup({
				projectId,
				repositories: [{ id, mode }],
			});
			expect(again.created).toBe(false);
		}
	});

	it("gives a legacy cloud candidate the project id as its repository id", async () => {
		const legacyId = randomUUID();
		const { caller } = setup({
			v2Project: {
				findByGitHubRemote: {
					query: async () => ({
						candidates: [{ id: legacyId, name: "Legacy" }],
					}),
				},
			},
		});
		const path = await repo("https://github.com/acme/legacy.git");

		const { candidates } = await caller.findByPath({
			repoPath: path,
			walkAllRemotes: true,
		});

		expect(candidates).toMatchObject([
			{ id: legacyId, repositoryId: legacyId, source: "remote" },
		]);
	});
});
