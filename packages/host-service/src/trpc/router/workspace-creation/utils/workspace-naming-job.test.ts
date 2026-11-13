import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { seedProject } from "../../../../../test/helpers/seed";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../types";
import { decideNaming, projectGithubRepo } from "./workspace-naming-job";

const names = { title: "Fix login", branchName: "fix-login" };
const base = {
	names,
	canRenameBranch: true,
	attempt: 1,
	prompt: "Fix the login bug.",
	hasAgent: true,
	hasAgentReply: false,
};

describe("decideNaming", () => {
	test("applies title and branch when names came back and the branch is still automatic", () => {
		expect(decideNaming(base)).toEqual({
			title: "Fix login",
			branchName: "fix-login",
			pending: false,
			gaveUp: false,
		});
	});

	test("keeps the branch when it was pushed, switched or the probe said no", () => {
		expect(
			decideNaming({ ...base, canRenameBranch: false }).branchName,
		).toBeNull();
	});

	test("a vague first pass applies the guess, keeps the row pending and holds the branch", () => {
		expect(decideNaming({ ...base, names: { ...names, vague: true } })).toEqual(
			{
				title: "Fix login",
				branchName: null,
				pending: true,
				gaveUp: false,
			},
		);
		expect(
			decideNaming({
				...base,
				names: { ...names, vague: true },
				hasAgentReply: true,
			}).pending,
		).toBe(false);
	});

	test("a failed first attempt falls back to the prompt title and stays pending", () => {
		expect(decideNaming({ ...base, names: null })).toEqual({
			title: "Fix the login bug",
			branchName: null,
			pending: true,
			gaveUp: false,
		});
		expect(decideNaming({ ...base, names: null, attempt: 2 }).title).toBeNull();
	});

	test("a failed branch probe counts as a failed attempt", () => {
		expect(decideNaming({ ...base, canRenameBranch: null }).pending).toBe(true);
	});

	test("gives up after the last attempt, and at once without an agent", () => {
		expect(decideNaming({ ...base, names: null, attempt: 3 })).toMatchObject({
			pending: false,
			gaveUp: true,
		});
		expect(
			decideNaming({ ...base, names: null, hasAgent: false }),
		).toMatchObject({
			pending: false,
			gaveUp: true,
		});
	});
});

describe("projectGithubRepo", () => {
	const root = mkdtempSync(join(tmpdir(), "naming-repo-"));
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	test("reads the primary repository of a multi-repo project", async () => {
		const web = join(root, "web");
		mkdirSync(web);
		const git = createUserSimpleGit(web);
		await git.init();
		await git.addRemote("origin", "https://github.com/acme/web.git");
		const db = drizzle(new Database(":memory:"), {
			schema,
		}) as unknown as HostDb;
		migrate(db as never, {
			migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
		});
		const project = seedProject(
			{ db },
			{ repoPath: web, repositories: [{ repoPath: join(root, "api") }] },
		);

		expect(
			await projectGithubRepo({ db } as unknown as HostServiceContext, {
				id: project.id,
				primaryRepositoryId: project.repositoryId,
			}),
		).toEqual({ owner: "acme", name: "web" });
	});
});
