import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { simpleGit } from "simple-git";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import { createGitFactory } from "../../../../runtime/git";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory } from "../../../index";
import { createFromImportLocal } from "../../project/handlers";
import { workspaceCreationRouter } from "../workspace-creation";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../../drizzle");
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("workspaceCreation.searchBranches", () => {
	test("its refresh fetch tells Git Credential Manager not to prompt", async () => {
		const root = mkdtempSync(join(tmpdir(), "search-branches-"));
		tempDirs.push(root);
		const repoPath = join(root, "repo");
		const capturedEnvPath = join(root, "gcm-interactive.txt");
		const fakeSsh = join(root, "fake-ssh.sh");
		await writeFile(
			fakeSsh,
			`#!/bin/sh\nprintf '%s' "$GCM_INTERACTIVE" > '${capturedEnvPath}'\nexit 1\n`,
		);
		chmodSync(fakeSsh, 0o755);
		await simpleGit().init([repoPath]);
		const git = simpleGit(repoPath, {
			unsafe: { allowUnsafeSshCommand: true },
		});
		await git.raw(["config", "user.email", "test@test.local"]);
		await git.raw(["config", "user.name", "Test"]);
		await git.raw(["commit", "--allow-empty", "-m", "init"]);
		await git.raw(["remote", "add", "origin", "ssh://example.invalid/r.git"]);
		await git.raw(["config", "core.sshCommand", fakeSsh]);

		const db = drizzle(new Database(":memory:"), { schema });
		migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		const ctx = {
			db: db as unknown as HostDb,
			api: { analytics: { captureEvent: { mutate: async () => {} } } },
			eventBus: new Proxy({}, { get: () => () => {} }),
			git: createGitFactory({
				getCredentials: async () => ({
					env: {
						PATH: process.env.PATH ?? "",
						GIT_CONFIG_GLOBAL: "/dev/null",
						GIT_CONFIG_NOSYSTEM: "1",
					},
				}),
				getToken: async () => null,
				credentialRemedy: () => "no credentials",
			}),
			isAuthenticated: true,
			organizationId: "org-test",
		} as unknown as HostServiceContext;
		const { projectId } = await createFromImportLocal(ctx, {
			name: "Demo",
			repoPath,
		});

		await createCallerFactory(workspaceCreationRouter)(ctx).searchBranches({
			projectId,
			refresh: true,
		});

		expect(await readFile(capturedEnvPath, "utf8")).toBe("never");
	});
});
