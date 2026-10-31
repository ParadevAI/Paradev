import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { GitClient } from "../shared/types";
import { planBranchSource } from "./plan-branch-source";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

async function setupClones() {
	const root = mkdtempSync(join(tmpdir(), "plan-branch-source-"));
	dirs.push(root);
	const remote = join(root, "remote.git");
	await simpleGit().init(["--bare", "--initial-branch=main", remote]);

	const pusher = simpleGit(root);
	await pusher.clone(remote, "pusher");
	const pusherGit = simpleGit(join(root, "pusher"))
		.addConfig("user.email", "test@example.com")
		.addConfig("user.name", "Test");
	await pusherGit.raw(["commit", "--allow-empty", "-m", "init"]);
	await pusherGit.push("origin", "main");

	await simpleGit(root).clone(remote, "host");
	const hostGit = simpleGit(join(root, "host")) as unknown as GitClient;
	return { pusherGit, hostGit };
}

describe("planBranchSource", () => {
	test.each([
		"feat/pushed",
		"origin/feat/pushed",
	])("fetches %s pushed after the last fetch instead of creating it", async (input) => {
		const { pusherGit, hostGit } = await setupClones();
		await pusherGit.checkoutLocalBranch("feat/pushed");
		await pusherGit.raw(["commit", "--allow-empty", "-m", "work"]);
		await pusherGit.push("origin", "feat/pushed");
		const pushedSha = (await pusherGit.revparse(["HEAD"])).trim();

		const plan = await planBranchSource(hostGit, input, "main", (target) =>
			hostGit.fetch([target.remote, target.branch, "--quiet", "--no-tags"]),
		);

		expect(plan.usedExistingBranch).toBe(true);
		expect(plan.startPoint.kind).toBe("remote-tracking");
		expect(
			(await hostGit.revparse(["refs/remotes/origin/feat/pushed"])).trim(),
		).toBe(pushedSha);
	});
});
