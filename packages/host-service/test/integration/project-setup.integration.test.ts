import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture } from "../helpers/git-fixture";

describe("project lifecycle error paths", () => {
	let host: TestHost;

	afterEach(async () => {
		if (host) await host.dispose();
	});

	test("remove() is idempotent when project doesn't exist", async () => {
		host = await createTestHost();
		const result = await host.trpc.project.remove.mutate({
			projectId: randomUUID(),
		});
		expect(result).toEqual({ success: true });
	});

	test("relocateRepository refuses a folder another project has", async () => {
		host = await createTestHost();
		const a = await createGitFixture();
		const b = await createGitFixture();
		try {
			const first = await host.trpc.project.create.mutate({
				name: "A",
				repositories: [{ kind: "local", path: a.repoPath }],
			});
			await host.trpc.project.create.mutate({
				name: "B",
				repositories: [{ kind: "local", path: b.repoPath }],
			});
			await expect(
				host.trpc.project.relocateRepository.mutate({
					projectId: first.id,
					repositoryId: first.primaryRepositoryId,
					path: b.repoPath,
				}),
			).rejects.toThrow(/repository_taken/);
		} finally {
			a.dispose();
			b.dispose();
		}
	});
});

describe("project.create empty mode is fully local", () => {
	let host: TestHost;

	afterEach(async () => {
		if (host) await host.dispose();
	});

	test("creates repo dir and named row with zero workspaces and zero cloud calls", async () => {
		host = await createTestHost();
		const parentDir = mkdtempSync(join(tmpdir(), "empty-mode-parent-"));
		// initEmptyRepo makes an initial commit; CI runners have no global
		// git identity, so provide one via env for this process's git spawns.
		const savedEnv = {
			GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
			GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
			GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
			GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
		};
		process.env.GIT_AUTHOR_NAME = "Test Runner";
		process.env.GIT_AUTHOR_EMAIL = "test@superset.sh";
		process.env.GIT_COMMITTER_NAME = "Test Runner";
		process.env.GIT_COMMITTER_EMAIL = "test@superset.sh";
		try {
			const created = await host.trpc.project.create.mutate({
				name: "Fresh Local",
				repositories: [{ kind: "empty", name: "fresh-local" }],
				parentDir,
			});
			expect(created.repositories[0]?.path.startsWith(parentDir)).toBe(true);
			expect(
				existsSync(join(created.repositories[0]?.path ?? "", ".git")),
			).toBe(true);
			expect(host.db.select().from(workspaces).all()).toHaveLength(0);

			const row = host.db
				.select()
				.from(projects)
				.all()
				.find((p) => p.id === created.id);
			expect(row?.name).toBe("Fresh Local");
			expect(row?.updatedAt).toBeGreaterThan(0);
			expect(
				host.apiCalls.filter((c) => c.path.startsWith("v2Project.")),
			).toEqual([]);
		} finally {
			for (const [key, value] of Object.entries(savedEnv)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
			rmSync(parentDir, { recursive: true, force: true });
		}
	});
});
