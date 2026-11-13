import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import {
	assertDistinctRepositories,
	pushSnapshots,
	type RunTask,
	type SnapshotTarget,
} from "./snapshots";

const root = mkdtempSync(join(tmpdir(), "teleport-snapshots-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const gitEnv = {
	PATH: process.env.PATH ?? "",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};
const run: RunTask = (def, input) => def.handler(input);

async function checkout(name: string): Promise<SnapshotTarget> {
	const remote = join(root, `${name}.git`);
	const path = join(root, name);
	await simpleGit().init(["--bare", remote]);
	await simpleGit().clone(remote, path);
	const git = simpleGit(path);
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await writeFile(join(path, "a.txt"), `${name}\n`);
	await git.add("a.txt");
	await git.commit("initial");
	return {
		repositoryId: `r-${name}`,
		name,
		worktreePath: path,
		gitEnv,
		remote: "origin",
		repositoryFullName: `acme/${name}`,
	};
}

const remoteHas = async (name: string, branch: string) =>
	(
		await simpleGit(join(root, `${name}.git`)).raw(["branch", "--list", branch])
	).trim() !== "";

describe("pushSnapshots", () => {
	it("pushes every checkout to the one branch", async () => {
		const targets = [await checkout("web1"), await checkout("api1")];
		const snapshots = await pushSnapshots(targets, "superset/teleport-a", run);
		expect(snapshots.map((s) => [s.name, s.repositoryFullName])).toEqual([
			["web1", "acme/web1"],
			["api1", "acme/api1"],
		]);
		expect(await remoteHas("web1", "superset/teleport-a")).toBe(true);
		expect(await remoteHas("api1", "superset/teleport-a")).toBe(true);
	});

	it("deletes the branches already pushed when one checkout fails, naming it", async () => {
		const web = await checkout("web2");
		const api = await checkout("api2");
		const broken = { ...api, remote: "nowhere" };

		await expect(
			pushSnapshots([web, broken], "superset/teleport-b", run),
		).rejects.toThrow(/Could not push api2/);
		expect(await remoteHas("web2", "superset/teleport-b")).toBe(false);
	});
});

describe("pushSnapshots rollback", () => {
	it("deletes the branch even from a remote whose push was reported as failed", async () => {
		const web = await checkout("web3");
		const api = await checkout("api3");
		const landedThenFailed: RunTask = async (def, input) => {
			const result = await def.handler(input);
			if (
				def.type === "git/pushSnapshot" &&
				(input as { worktreePath: string }).worktreePath === api.worktreePath
			) {
				throw new Error("connection dropped");
			}
			return result;
		};

		await expect(
			pushSnapshots([web, api], "superset/teleport-c", landedThenFailed),
		).rejects.toThrow(/Could not push api3/);
		expect(await remoteHas("web3", "superset/teleport-c")).toBe(false);
		expect(await remoteHas("api3", "superset/teleport-c")).toBe(false);
	});
});

describe("assertDistinctRepositories", () => {
	it("refuses two checkouts of one GitHub repository, in any case", () => {
		const target = (name: string, repositoryFullName: string) =>
			({ name, repositoryFullName }) as SnapshotTarget;
		expect(() =>
			assertDistinctRepositories([
				target("web", "acme/web"),
				target("web-copy", "Acme/Web"),
			]),
		).toThrow(/web and web-copy are both Acme\/Web/);
		expect(() =>
			assertDistinctRepositories([
				target("web", "acme/web"),
				target("api", "acme/api"),
			]),
		).not.toThrow();
	});
});
