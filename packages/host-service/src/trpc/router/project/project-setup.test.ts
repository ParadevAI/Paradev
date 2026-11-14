import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
} from "node:fs";
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
import * as projectDeletion from "../../../projects/project-deletion";
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

	async function setUpClonedAndDeleted(names: string[]) {
		const { caller, db } = setup();
		const sources = await Promise.all(names.map(() => repo()));
		const created = origin(
			names.map((name, i) => ({ name, url: sources[i] as string })),
		);
		const parentDir = mkdtempSync(join(root, "gone-"));
		const project = await caller.setup({
			projectId: created.projectId,
			origin: created.origin,
			repositories: created.ids.map((id) => ({
				id,
				mode: { kind: "clone" as const, parentDir },
			})),
		});
		const paths = project.repositories.map((r) => r.path);
		created.ids.forEach((id, i) => {
			db.update(schema.repositories)
				.set({ url: sources[i] })
				.where(eq(schema.repositories.id, id))
				.run();
		});
		db.update(schema.projects)
			.set({ deletedAt: Date.now() })
			.where(eq(schema.projects.id, created.projectId))
			.run();
		for (const path of paths) rmSync(path, { recursive: true, force: true });
		return { caller, db, parentDir, paths, ...created };
	}

	it("clones a repository back into its folder when the folder is gone", async () => {
		const { caller, parentDir, paths, projectId, ids } =
			await setUpClonedAndDeleted(["web"]);
		const id = ids[0] as string;
		const path = paths[0] as string;

		await expect(
			caller.setup({
				projectId,
				repositories: [{ id, mode: { kind: "import", path } }],
			}),
		).rejects.toThrow();
		expect(await caller.list()).toEqual([]);

		const back = await caller.setup({
			projectId,
			repositories: [{ id, mode: { kind: "clone", parentDir } }],
		});

		expect(back.created).toBe(false);
		expect(back.repositories.map((r) => r.path)).toEqual([path]);
		expect(existsSync(join(path, ".git"))).toBe(true);
		expect((await caller.list()).map((p) => p.id)).toEqual([projectId]);
	});

	it("clones a deleted project into another folder only when asked to relocate", async () => {
		const { caller, paths, projectId, ids } = await setUpClonedAndDeleted([
			"web",
		]);
		const id = ids[0] as string;
		const elsewhere = mkdtempSync(join(root, "elsewhere-"));
		const moved = join(elsewhere, basename(paths[0] as string));

		await expect(
			caller.setup({
				projectId,
				repositories: [{ id, mode: { kind: "clone", parentDir: elsewhere } }],
			}),
		).rejects.toMatchObject({
			message: expect.stringContaining("already_set_up"),
		});
		expect(existsSync(moved)).toBe(false);

		const back = await caller.setup({
			projectId,
			repositories: [
				{
					id,
					mode: { kind: "clone", parentDir: elsewhere, allowRelocate: true },
				},
			],
		});

		expect(back.repositories.map((r) => r.path)).toEqual([moved]);
		expect(existsSync(join(moved, ".git"))).toBe(true);
		expect((await caller.list()).map((p) => p.id)).toEqual([projectId]);
	});

	it("removes a relocating clone when another clone of the set-up fails", async () => {
		const { caller, db, paths, projectId, ids } = await setUpClonedAndDeleted([
			"web",
			"api",
		]);
		db.update(schema.repositories)
			.set({ url: join(root, "no-such-source", "api") })
			.where(eq(schema.repositories.id, ids[1] as string))
			.run();
		const elsewhere = mkdtempSync(join(root, "elsewhere-"));

		await expect(
			caller.setup({
				projectId,
				repositories: ids.map((id) => ({
					id,
					mode: {
						kind: "clone" as const,
						parentDir: elsewhere,
						allowRelocate: true,
					},
				})),
			}),
		).rejects.toThrow();

		expect(readdirSync(elsewhere)).toEqual([]);
		expect(
			db
				.select({ repoPath: schema.repositories.repoPath })
				.from(schema.repositories)
				.all()
				.map((r) => r.repoPath)
				.sort(),
		).toEqual([...paths].sort());
		expect(await caller.list()).toEqual([]);
	});

	it("a deleted project that cannot be restored is a not_set_up error", async () => {
		const { caller, parentDir, projectId, ids } = await setUpClonedAndDeleted([
			"web",
		]);
		const restore = spyOn(projectDeletion, "restoreProject").mockReturnValue(
			null,
		);
		try {
			await expect(
				caller.setup({
					projectId,
					repositories: [
						{ id: ids[0] as string, mode: { kind: "clone", parentDir } },
					],
				}),
			).rejects.toMatchObject({
				code: "NOT_FOUND",
				message: expect.stringContaining("not_set_up"),
			});
		} finally {
			restore.mockRestore();
		}
	});

	it("removes every clone and leaves the project deleted when one clone fails", async () => {
		const { caller, db, parentDir, paths, projectId, ids } =
			await setUpClonedAndDeleted(["web", "api"]);
		const missingSource = join(
			root,
			"no-such-source",
			basename(paths[1] as string),
		);
		db.update(schema.repositories)
			.set({ url: missingSource })
			.where(eq(schema.repositories.id, ids[1] as string))
			.run();

		await expect(
			caller.setup({
				projectId,
				repositories: ids.map((id) => ({
					id,
					mode: { kind: "clone" as const, parentDir },
				})),
			}),
		).rejects.toThrow();

		for (const path of paths) expect(existsSync(path)).toBe(false);
		expect(await caller.list()).toEqual([]);
	});

	it("a clone matches the folder it would make, not the stored folder's name", async () => {
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
			.set({ url: "https://github.com/acme/other" })
			.where(eq(schema.repositories.id, id))
			.run();
		const clone = {
			id,
			mode: { kind: "clone" as const, parentDir: dirname(web) },
		};

		const again = await caller.setup({ projectId, repositories: [clone] });
		expect(again.created).toBe(false);

		rmSync(web, { recursive: true, force: true });
		await expect(
			caller.setup({ projectId, repositories: [clone] }),
		).rejects.toMatchObject({
			message: expect.stringContaining("repository_folder_unusable"),
		});
		expect(existsSync(join(dirname(web), "other"))).toBe(false);
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
