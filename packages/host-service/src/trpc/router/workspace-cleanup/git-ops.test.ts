import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostServiceContext } from "../../../types";
import { gitWorktreeStateTask } from "../../../workers/tasks/git";
import { cleanupGitOps } from "./git-ops";

const credentials = {
	getCredentials: async () => ({ env: { ...process.env } }),
} as unknown as HostServiceContext["credentials"];

let outer = "";
afterEach(() => {
	if (outer) rmSync(outer, { recursive: true, force: true });
});

test("a delete preflight in a folder that is not a repository does not read the enclosing one", async () => {
	outer = mkdtempSync(join(tmpdir(), "cleanup-ceiling-"));
	execFileSync("git", ["init", "-q", outer]);
	writeFileSync(join(outer, "dirty.txt"), "uncommitted\n");
	const checkout = join(outer, "api");
	mkdirSync(checkout);

	const gitEnv = await cleanupGitOps.resolveGitEnv({ credentials }, checkout);

	await expect(
		gitWorktreeStateTask.handler({ worktreePath: checkout, gitEnv }),
	).rejects.toThrow(/not a git repository/);
});
