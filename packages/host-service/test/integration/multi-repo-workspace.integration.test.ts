import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { eq } from "drizzle-orm";
import { simpleGit } from "simple-git";
import {
	projects,
	repositories,
	workspaceRepositories,
	workspaces,
} from "../../src/db/schema";
import { getTomlConfigPath } from "../../src/runtime/setup/project-config-toml";
import * as terminal from "../../src/terminal/terminal";
import { cleanupGitOps } from "../../src/trpc/router/workspace-cleanup/git-ops";
import * as addBranchWorktreeModule from "../../src/trpc/router/workspace-creation/shared/add-branch-worktree";
import * as naming from "../../src/trpc/router/workspace-creation/utils/ai-workspace-names";
import * as titleJobs from "../../src/workspaces/workspace-title-jobs";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createTestHost } from "../helpers/createTestHost";
import {
	copyGitFixture,
	createGitFixture,
	type GitFixture,
} from "../helpers/git-fixture";
import { seedProject, seedRepository } from "../helpers/seed";

let dispose: (() => Promise<void>) | undefined;
let templates: { web: GitFixture; api: GitFixture };

beforeAll(async () => {
	const [web, api] = await Promise.all([
		createGitFixture(),
		createGitFixture(),
	]);
	templates = { web, api };
});

afterAll(() => {
	templates.web.dispose();
	templates.api.dispose();
});

afterEach(async () => {
	await dispose?.();
	dispose = undefined;
});

type ExecGh = NonNullable<Parameters<typeof createTestHost>[0]>["execGh"];

/** A project of `web` (primary) and `api`, each its own real repository. */
async function multiRepoScenario(options: { execGh?: ExecGh } = {}) {
	const host = await createTestHost({
		apiOverrides: {
			...cloudFlows.workspaceCreateOk(),
			"v2Workspace.trackCreated.mutate": () => ({}),
		},
		...(options.execGh ? { execGh: options.execGh } : {}),
	});
	const web = copyGitFixture(templates.web);
	const api = copyGitFixture(templates.api);
	const worktreeBaseDir = mkdtempSync(join(tmpdir(), "multi-repo-worktrees-"));
	const cleanup: string[] = [worktreeBaseDir];
	dispose = async () => {
		const roots = host.db
			.select({ worktreePath: workspaces.worktreePath })
			.from(workspaces)
			.all();
		await host.dispose();
		for (const path of [...roots.map((row) => row.worktreePath), ...cleanup]) {
			rmSync(path, { recursive: true, force: true });
		}
		web.dispose();
		api.dispose();
	};
	const project = seedProject(host, {
		repoPath: web.repoPath,
		repositoryName: "web",
		worktreeBaseDir,
		repositories: [
			{ repoPath: api.repoPath, name: "api", repoOwner: "o", repoName: "api" },
		],
	});
	const [webId, apiId] = project.repositoryIds as [string, string];
	return {
		host,
		projectId: project.id,
		web,
		api,
		webId,
		apiId,
		cleanup,
		worktreeBaseDir,
	};
}

async function createBoth(
	scenario: Awaited<ReturnType<typeof multiRepoScenario>>,
) {
	const { workspace } = await scenario.host.trpc.workspaces.create.mutate({
		projectId: scenario.projectId,
		name: "both",
		branch: "feature/both",
	});
	return workspace;
}

const headOf = async (path: string) => {
	const git = simpleGit(path);
	return {
		oid: (await git.revparse(["HEAD"])).trim(),
		branch: (await git.revparse(["--abbrev-ref", "HEAD"])).trim(),
	};
};

const worktreeCount = (repoPath: string) =>
	Bun.spawnSync(["git", "worktree", "list"], { cwd: repoPath })
		.stdout.toString()
		.trim()
		.split("\n").length;

test("a one-repository workspace's folder is its checkout", async () => {
	const host = await createTestHost({
		apiOverrides: {
			...cloudFlows.workspaceCreateOk(),
			"v2Workspace.trackCreated.mutate": () => ({}),
		},
	});
	const repo = copyGitFixture(templates.web);
	dispose = async () => {
		await host.dispose();
		repo.dispose();
	};
	const project = seedProject(host, { repoPath: repo.repoPath });

	const { workspace } = await host.trpc.workspaces.create.mutate({
		projectId: project.id,
		branch: "feature/one",
	});

	expect(workspace.checkouts).toMatchObject([
		{
			repositoryId: project.repositoryId,
			isPrimary: true,
			path: workspace.worktreePath,
			branch: "feature/one",
		},
	]);
	expect(existsSync(join(workspace.worktreePath, ".git"))).toBe(true);
	await host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId: workspace.id,
	});
	expect(existsSync(workspace.worktreePath)).toBe(false);
});

test("a two-repository workspace checks out each one at <root>/<name>, and get and list return them", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);
	const root = workspace.worktreePath;

	expect(
		workspace.checkouts.map(({ name, path, branch, isPrimary }) => ({
			name,
			path,
			branch,
			isPrimary,
		})),
	).toEqual([
		{
			name: "api",
			path: join(root, "api"),
			branch: "feature/both",
			isPrimary: false,
		},
		{
			name: "web",
			path: join(root, "web"),
			branch: "feature/both",
			isPrimary: true,
		},
	]);
	for (const checkout of workspace.checkouts) {
		expect(await headOf(checkout.path)).toMatchObject({
			branch: "feature/both",
		});
	}
	expect(existsSync(join(root, ".git"))).toBe(false);
	expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
		join(root, "api"),
	);

	const got = await scenario.host.trpc.workspace.get.query({
		id: workspace.id,
	});
	expect(got.checkouts).toEqual(workspace.checkouts);
	const [listed] = await scenario.host.trpc.workspace.list.query();
	expect(listed?.checkouts).toEqual(workspace.checkouts);
});

test("deleting a multi-repo workspace removes every worktree and the root", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);

	const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId: workspace.id,
		deleteBranch: true,
	});

	expect(result).toMatchObject({
		worktreeRemoved: true,
		branchDeleted: true,
		warnings: [],
	});
	expect(existsSync(workspace.worktreePath)).toBe(false);
	for (const fixture of [scenario.web, scenario.api]) {
		expect(worktreeCount(fixture.repoPath)).toBe(1);
		expect((await fixture.git.branchLocal()).all.includes("feature/both")).toBe(
			false,
		);
	}
});

test("the root links each repository's skills and points at its instructions; delete removes them", async () => {
	const scenario = await multiRepoScenario();
	mkdirSync(join(scenario.api.repoPath, ".claude", "skills", "migrate"), {
		recursive: true,
	});
	await scenario.api.commit("instructions and a skill", {
		"AGENTS.md": "api rules\n",
		".claude/skills/migrate/SKILL.md": "# migrate\n",
	});
	const workspace = await createBoth(scenario);
	const root = workspace.worktreePath;

	expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
		`- api: ${join(root, "api", "AGENTS.md")}\n`,
	);
	expect(
		readFileSync(
			join(root, ".claude", "skills", "migrate", "SKILL.md"),
			"utf8",
		),
	).toBe("# migrate\n");

	const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId: workspace.id,
	});
	expect(result).toMatchObject({ worktreeRemoved: true, warnings: [] });
	expect(existsSync(root)).toBe(false);
});

test("the root links the primary repository's .mcp.json, follows a primary change, and delete removes it", async () => {
	const scenario = await multiRepoScenario();
	await scenario.web.commit("web mcp", { ".mcp.json": '{"web":true}\n' });
	await scenario.api.commit("api mcp", { ".mcp.json": '{"api":true}\n' });
	const workspace = await createBoth(scenario);
	const mcp = join(workspace.worktreePath, ".mcp.json");

	expect(readFileSync(mcp, "utf8")).toBe('{"web":true}\n');
	expect(
		readFileSync(join(workspace.worktreePath, "AGENTS.md"), "utf8"),
	).toContain(
		"MCP servers and settings come from the primary repository (web).",
	);

	await scenario.host.trpc.project.setPrimaryRepository.mutate({
		projectId: scenario.projectId,
		repositoryId: scenario.apiId,
	});
	expect(readFileSync(mcp, "utf8")).toBe('{"api":true}\n');

	const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId: workspace.id,
	});
	expect(result).toMatchObject({ worktreeRemoved: true, warnings: [] });
	expect(existsSync(workspace.worktreePath)).toBe(false);
});

test("a dirty checkout blocks the delete and is named, before any checkout is removed", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);
	const api = workspace.checkouts.find((c) => c.name === "api");
	writeFileSync(join(api?.path ?? "", "dirty.txt"), "wip");

	await expect(
		scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: workspace.id,
		}),
	).rejects.toThrow("api: Worktree has uncommitted changes");
	for (const checkout of workspace.checkouts) {
		expect(existsSync(checkout.path)).toBe(true);
	}
	const row = await scenario.host.trpc.workspace.get.query({
		id: workspace.id,
	});
	expect(row.archivedAt).toBeNull();
});

test("a delete that fails on one checkout names the checkouts already removed", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);
	const realRemove = cleanupGitOps.removeWorktree;
	const remove = spyOn(cleanupGitOps, "removeWorktree").mockImplementation(
		async (args) =>
			args.worktreePath.endsWith("/web")
				? { stillRegistered: true, removeError: "locked" }
				: realRemove(args),
	);
	try {
		await expect(
			scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: workspace.id,
			}),
		).rejects.toThrow(
			/^web: Failed to remove worktree .*: locked\. Already removed: api$/,
		);
	} finally {
		remove.mockRestore();
	}
});

test("files an agent left in the root warn and block the delete; a forced delete removes the root", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);
	const root = workspace.worktreePath;
	mkdirSync(join(root, ".claude"));
	writeFileSync(join(root, ".claude", "settings.local.json"), "{}");

	const inspected = await scenario.host.trpc.workspaceCleanup.inspect.query({
		workspaceId: workspace.id,
	});
	expect(inspected.hasChanges).toBe(true);
	await expect(
		scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: workspace.id,
		}),
	).rejects.toThrow(
		"Workspace folder has files outside the repositories: .claude/settings.local.json",
	);
	expect(existsSync(join(root, "api"))).toBe(true);

	const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId: workspace.id,
		force: true,
	});
	expect(result).toMatchObject({ worktreeRemoved: true, warnings: [] });
	expect(existsSync(root)).toBe(false);
});

test("restoring a deleted multi-repo workspace brings back every checkout", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);
	await scenario.host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId: workspace.id,
	});

	await scenario.host.trpc.workspaces.restore.mutate({
		workspaceId: workspace.id,
	});

	for (const checkout of workspace.checkouts) {
		expect(await headOf(checkout.path)).toMatchObject({
			branch: "feature/both",
		});
	}
	expect(existsSync(join(workspace.worktreePath, "AGENTS.md"))).toBe(true);
});

test("each repository branches from the base branch picked for it, the rest from their default", async () => {
	const scenario = await multiRepoScenario();
	await scenario.api.git.checkoutLocalBranch("release");
	await scenario.api.commit("release work", { "release.txt": "v2" });
	await scenario.api.git.checkout("main");

	const { workspace } = await scenario.host.trpc.workspaces.create.mutate({
		projectId: scenario.projectId,
		branch: "feature/both",
		checkouts: { [scenario.apiId]: { baseBranch: "release" } },
	});

	const [api, web] = workspace.checkouts;
	expect(existsSync(join(api?.path ?? "", "release.txt"))).toBe(true);
	expect(existsSync(join(web?.path ?? "", "release.txt"))).toBe(false);
	expect(
		(await scenario.api.git.raw(["config", "branch.feature/both.base"])).trim(),
	).toBe("release");
});

/** `api` has PR #7 on a bare remote; gh answers for it only. */
async function pullRequestScenario() {
	let prHeadOid = "";
	let apiRepoPath = "";
	const scenario = await multiRepoScenario({
		execGh: async (args, options?: unknown) => {
			const cwd = (options as { cwd?: string } | undefined)?.cwd;
			if (args[0] === "pr" && args[1] === "view" && cwd === apiRepoPath) {
				return {
					number: 7,
					url: "https://github.com/o/api/pull/7",
					title: "Add todo tags",
					headRefName: "add-todo-tags",
					headRefOid: prHeadOid,
					baseRefName: "main",
					headRepositoryOwner: { login: "o" },
					headRepository: { name: "api" },
					isCrossRepository: false,
					state: "OPEN",
				};
			}
			throw new Error(`unexpected gh call: ${args.join(" ")}`);
		},
	});
	const { api } = scenario;
	apiRepoPath = api.repoPath;
	const remote = `${api.repoPath}-origin.git`;
	scenario.cleanup.push(remote);
	await simpleGit().raw(["init", "--bare", "--initial-branch=main", remote]);
	await api.git.addRemote("origin", remote);
	await api.git.push("origin", "main", ["--set-upstream"]);
	await api.git.checkoutLocalBranch("add-todo-tags");
	await api.commit("tags endpoint", { "tags.ts": "tags\n" });
	prHeadOid = (await api.git.revparse(["HEAD"])).trim();
	await api.git.push("origin", "add-todo-tags");
	await api.git.checkout("main");
	await api.git.deleteLocalBranch("add-todo-tags", true);
	return { ...scenario, prHeadOid };
}

async function expectPrCheckouts(
	scenario: Awaited<ReturnType<typeof pullRequestScenario>>,
	workspace: { branch: string; name: string; checkouts: { path: string }[] },
	web: GitFixture,
) {
	expect(workspace.branch).toBe("add-todo-tags");
	expect(workspace.name).toBe("Add todo tags");
	const [api, webCheckout] = workspace.checkouts;
	expect(await headOf(api?.path ?? "")).toEqual({
		oid: scenario.prHeadOid,
		branch: "add-todo-tags",
	});
	expect(await headOf(webCheckout?.path ?? "")).toEqual({
		oid: (await web.git.revparse(["main"])).trim(),
		branch: "add-todo-tags",
	});
}

test("a repository's checkouts[id].pr starts it from the PR, the others branch on the PR's branch", async () => {
	const scenario = await pullRequestScenario();

	const { workspace } = await scenario.host.trpc.workspaces.create.mutate({
		projectId: scenario.projectId,
		checkouts: { [scenario.apiId]: { pr: 7 } },
	});

	await expectPrCheckouts(scenario, workspace, scenario.web);
});

test("two creates from one PR at once return one workspace", async () => {
	const scenario = await pullRequestScenario();
	const create = () =>
		scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkouts: { [scenario.apiId]: { pr: 7 } },
		});

	const [first, second] = await Promise.all([create(), create()]);

	expect(second.workspace.id).toBe(first.workspace.id);
	expect([first.alreadyExists, second.alreadyExists].sort()).toEqual([
		false,
		true,
	]);
});

test("pullRequest names its repository by owner/name, case-insensitively", async () => {
	const scenario = await pullRequestScenario();
	// The repository is matched on its live GitHub remote, not stored fields.
	await scenario.api.git.addRemote("github", "https://github.com/o/api.git");

	const { workspace } = await scenario.host.trpc.workspaces.create.mutate({
		projectId: scenario.projectId,
		pullRequest: { repository: "O/API", number: 7 },
	});

	await expectPrCheckouts(scenario, workspace, scenario.web);
});

test("pullRequest for a repository outside the project is NOT_FOUND", async () => {
	const scenario = await multiRepoScenario();

	await expect(
		scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			pullRequest: { repository: "someone/else", number: 7 },
		}),
	).rejects.toMatchObject({
		data: { code: "NOT_FOUND" },
		message: expect.stringContaining("repository_not_in_project"),
	});
});

test("pullRequest and checkouts naming two PRs for one repository is BAD_REQUEST", async () => {
	const scenario = await multiRepoScenario();
	await scenario.api.git.addRemote("github", "https://github.com/o/api.git");

	await expect(
		scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkouts: { [scenario.apiId]: { pr: 8 } },
			pullRequest: { repository: "o/api", number: 7 },
		}),
	).rejects.toMatchObject({
		data: { code: "BAD_REQUEST" },
		message: expect.stringContaining("two different PRs"),
	});
});

function addOutsideWorktree(repoPath: string, branch: string): string {
	const path = `${repoPath}-${branch.replaceAll("/", "-")}`;
	const added = Bun.spawnSync(["git", "worktree", "add", "-b", branch, path], {
		cwd: repoPath,
	});
	if (added.exitCode !== 0) throw new Error(added.stderr.toString());
	return path;
}

test("an adopted worktree moves to <root>/<name>, and the others branch on its branch", async () => {
	const scenario = await multiRepoScenario();
	const outside = addOutsideWorktree(scenario.api.repoPath, "feature/started");

	const { workspace } = await scenario.host.trpc.workspaces.create.mutate({
		projectId: scenario.projectId,
		checkouts: { [scenario.apiId]: { worktreePath: outside } },
	});

	expect(workspace.branch).toBe("feature/started");
	expect(
		workspace.checkouts.map(({ path, branch }) => ({ path, branch })),
	).toEqual([
		{ path: join(workspace.worktreePath, "api"), branch: "feature/started" },
		{ path: join(workspace.worktreePath, "web"), branch: "feature/started" },
	]);
	expect(existsSync(outside)).toBe(false);
	const { worktrees } =
		await scenario.host.trpc.workspaceCreation.listProjectWorktrees.query({
			projectId: scenario.projectId,
			repositoryId: scenario.apiId,
		});
	expect(
		worktrees.find((worktree) => worktree.branch === "feature/started")
			?.workspaceId,
	).toBe(workspace.id);
});

test("a failed create leaves nothing behind: no row, worktree, branch or root, and the adopted worktree is back", async () => {
	const scenario = await multiRepoScenario();
	const outside = addOutsideWorktree(scenario.api.repoPath, "feature/kept");
	scenario.cleanup.push(outside);
	rmSync(join(scenario.web.repoPath, ".git"), { recursive: true, force: true });

	await expect(
		scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkouts: { [scenario.apiId]: { worktreePath: outside } },
		}),
	).rejects.toThrow("web");

	expect(scenario.host.db.select().from(workspaces).all()).toEqual([]);
	expect(scenario.host.db.select().from(workspaceRepositories).all()).toEqual(
		[],
	);
	expect(await headOf(outside)).toMatchObject({ branch: "feature/kept" });
	expect(worktreeCount(scenario.api.repoPath)).toBe(2);
	expect(readdirSync(scenario.worktreeBaseDir)).toEqual([]);
});

test("when an adopted worktree cannot move back, the failed create keeps the root and the adopted files", async () => {
	const scenario = await multiRepoScenario();
	const outside = addOutsideWorktree(scenario.api.repoPath, "feature/wip");
	scenario.cleanup.push(outside);
	writeFileSync(join(outside, "wip.txt"), "uncommitted");
	const added = spyOn(
		addBranchWorktreeModule,
		"addBranchWorktree",
	).mockImplementation(async () => {
		writeFileSync(outside, "something took the old path");
		throw new Error("web checkout failed");
	});
	try {
		const error = await scenario.host.trpc.workspaces.create
			.mutate({
				projectId: scenario.projectId,
				checkouts: { [scenario.apiId]: { worktreePath: outside } },
			})
			.then(
				() => null,
				(err: Error) => err,
			);

		const root = error?.message.match(/so (\S+) was kept/)?.[1] ?? "";
		expect(error?.message).toContain(`api is still at ${join(root, "api")}`);
		expect(readFileSync(join(root, "api", "wip.txt"), "utf8")).toBe(
			"uncommitted",
		);
		expect(scenario.host.db.select().from(workspaces).all()).toEqual([]);
	} finally {
		added.mockRestore();
	}
});

test("a local checkout is refused for a multi-repo project", async () => {
	const scenario = await multiRepoScenario();

	await expect(
		scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
		}),
	).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
	expect(scenario.host.db.select().from(workspaces).all()).toEqual([]);
});

function writeTomlConfig(repoPath: string, name: string) {
	const path = getTomlConfigPath(repoPath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		`[install]\nrun = ["echo ${name}-install"]\ncwd = "${name}"\n\n[setup]\nrun = ["echo ${name}-setup"]\n`,
	);
}

test("setup runs once in the workspace root, from the current primary repository's config.toml", async () => {
	const scenario = await multiRepoScenario();
	const started = spyOn(
		terminal,
		"createTerminalSessionInternal",
	).mockResolvedValue({} as never);
	try {
		writeTomlConfig(scenario.web.repoPath, "web");
		writeTomlConfig(scenario.api.repoPath, "api");

		const { workspace, terminals } =
			await scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				branch: "feature/setup",
			});
		const root = workspace.worktreePath;
		const setupOf = (name: string) =>
			`(cd '${join(root, name)}' && echo ${name}-install) && (cd '${root}' && echo ${name}-setup)`;

		expect(terminals).toHaveLength(1);
		expect(started).toHaveBeenCalledTimes(1);
		expect(started.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: workspace.id,
			initialCommand: setupOf("web"),
		});

		await scenario.host.trpc.project.setPrimaryRepository.mutate({
			projectId: scenario.projectId,
			repositoryId: scenario.apiId,
		});
		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: workspace.id,
		});
		started.mockClear();
		await scenario.host.trpc.workspaces.restore.mutate({
			workspaceId: workspace.id,
		});

		expect(started).toHaveBeenCalledTimes(1);
		expect(started.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: workspace.id,
			initialCommand: setupOf("api"),
		});
	} finally {
		started.mockRestore();
	}
});

test("a workspace with no checkout of a new primary repository reads only that repository's config", async () => {
	const host = await createTestHost({
		apiOverrides: {
			...cloudFlows.workspaceCreateOk(),
			"v2Workspace.trackCreated.mutate": () => ({}),
		},
	});
	const web = copyGitFixture(templates.web);
	const api = copyGitFixture(templates.api);
	let root = "";
	dispose = async () => {
		await host.dispose();
		rmSync(root, { recursive: true, force: true });
		web.dispose();
		api.dispose();
	};
	const project = seedProject(host, { repoPath: web.repoPath, name: "web" });
	mkdirSync(dirname(getTomlConfigPath(web.repoPath)), { recursive: true });
	await web.commit("config", {
		[relative(web.repoPath, getTomlConfigPath(web.repoPath))]:
			'[setup]\nrun = ["echo web-setup"]\n',
	});
	const started = spyOn(
		terminal,
		"createTerminalSessionInternal",
	).mockResolvedValue({} as never);
	try {
		const { workspace } = await host.trpc.workspaces.create.mutate({
			projectId: project.id,
			branch: "feature/primary",
		});
		root = workspace.worktreePath;
		const apiId = seedRepository(host, project.id, {
			repoPath: api.repoPath,
			name: "api",
		}).id;
		writeTomlConfig(api.repoPath, "api");
		await host.trpc.project.setPrimaryRepository.mutate({
			projectId: project.id,
			repositoryId: apiId,
		});
		await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: workspace.id,
		});
		started.mockClear();
		await host.trpc.workspaces.restore.mutate({ workspaceId: workspace.id });

		expect(started.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: workspace.id,
			initialCommand: `(cd '${join(root, "api")}' && echo api-install) && (cd '${root}' && echo api-setup)`,
		});
	} finally {
		started.mockRestore();
	}
});

test("git calls on a multi-repo workspace must name the repository", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);

	await expect(
		scenario.host.trpc.git.getStatus.query({ workspaceId: workspace.id }),
	).rejects.toThrow("repository_required");
	const status = await scenario.host.trpc.git.getStatus.query({
		workspaceId: workspace.id,
		repositoryId: scenario.apiId,
	});
	expect(status).toBeTruthy();
});

test("the workspace branch follows once every checkout is renamed to the same branch", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);
	const rename = (repositoryId: string) =>
		scenario.host.trpc.git.renameBranch.mutate({
			workspaceId: workspace.id,
			repositoryId,
			oldName: "feature/both",
			newName: "feature/renamed",
		});
	const workspaceBranch = async () =>
		(await scenario.host.trpc.workspace.get.query({ id: workspace.id })).branch;

	await rename(scenario.apiId);
	expect(await workspaceBranch()).toBe("feature/both");
	await rename(scenario.webId);
	expect(await workspaceBranch()).toBe("feature/renamed");
});

test("a repository a live workspace checks out cannot be removed from the project", async () => {
	const scenario = await multiRepoScenario();
	await createBoth(scenario);

	await expect(
		scenario.host.trpc.project.removeRepository.mutate({
			projectId: scenario.projectId,
			repositoryId: scenario.apiId,
		}),
	).rejects.toMatchObject({ data: { code: "PRECONDITION_FAILED" } });
});

test("fetchBranch fetches the move branch into every repository, and names one that lacks it", async () => {
	const scenario = await multiRepoScenario();
	const branch = "superset/teleport-abc";
	for (const fixture of [scenario.web, scenario.api]) {
		const remote = mkdtempSync(join(tmpdir(), "multi-repo-remote-"));
		scenario.cleanup.push(remote);
		await simpleGit(remote).init(["--bare"]);
		await fixture.git.addRemote("origin", remote);
	}
	await scenario.web.git.push("origin", `HEAD:refs/heads/${branch}`);
	const fetchBranch = () =>
		scenario.host.trpc.teleport.fetchBranch.mutate({
			projectId: scenario.projectId,
			branch,
		});

	await expect(fetchBranch()).rejects.toThrow(/not on the remote of: api$/);

	await scenario.api.git.push("origin", `HEAD:refs/heads/${branch}`);
	await fetchBranch();
	for (const fixture of [scenario.web, scenario.api]) {
		expect(
			(
				await fixture.git.raw(["branch", "-r", "--list", `origin/${branch}`])
			).trim(),
		).toBe(`origin/${branch}`);
	}
});

test("AI naming renames the branch in every checkout still on the generated name", async () => {
	const generator = spyOn(
		naming,
		"generateWorkspaceNamesFromPrompt",
	).mockResolvedValue({ title: "Fix login", branchName: "repair-auth" });
	const queueTitleJob = titleJobs.queueWorkspaceTitleJob;
	let namingDone!: () => void;
	const named = new Promise<void>((resolve) => {
		namingDone = resolve;
	});
	const queued = spyOn(titleJobs, "queueWorkspaceTitleJob").mockImplementation(
		(db, workspaceId, run) =>
			queueTitleJob(db, workspaceId, (isCurrent, signal) =>
				run(isCurrent, signal).finally(namingDone),
			),
	);
	try {
		const scenario = await multiRepoScenario();
		const { workspace } = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			namingPrompt: "Fix the login bug",
		});
		await named;

		const renamed = await scenario.host.trpc.workspace.get.query({
			id: workspace.id,
		});
		expect(renamed.name).toBe("Fix login");
		expect(renamed.branch).toContain("repair-auth");
		for (const checkout of renamed.checkouts) {
			expect(checkout.branch).toBe(renamed.branch);
			expect((await headOf(checkout.path)).branch).toBe(renamed.branch);
		}
	} finally {
		queued.mockRestore();
		generator.mockRestore();
	}
});

test("a repeated create on the same typed branch opens the existing workspace", async () => {
	const scenario = await multiRepoScenario();
	const first = await createBoth(scenario);

	const second = await scenario.host.trpc.workspaces.create.mutate({
		projectId: scenario.projectId,
		branch: "feature/both",
	});

	expect(second.alreadyExists).toBe(true);
	expect(second.workspace.id).toBe(first.id);
});

test("a branch named from the workspace name skips names any repository already has", async () => {
	const scenario = await multiRepoScenario();
	await scenario.api.git.branch(["fix-login"]);
	const create = async () =>
		(
			await scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "Fix login",
			})
		).workspace.branch;

	expect(await create()).toBe("fix-login-2");
	expect(await create()).toBe("fix-login-3");
});

test("a typed new branch gets the project prefix; an existing branch and skipBranchPrefix do not", async () => {
	const scenario = await multiRepoScenario();
	scenario.host.db
		.update(projects)
		.set({ branchPrefixMode: "custom", branchPrefixCustom: "me" })
		.where(eq(projects.id, scenario.projectId))
		.run();
	await scenario.api.git.branch(["release"]);
	const create = async (branch: string, skipBranchPrefix?: boolean) =>
		(
			await scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				branch,
				skipBranchPrefix,
			})
		).workspace.branch;

	expect(await create("feature/new")).toBe("me/feature/new");
	expect(await create("release")).toBe("release");
	expect(await create("feature/exact", true)).toBe("feature/exact");
});

test("a moved branch under a remote not named origin is checked out, not branched anew", async () => {
	const scenario = await multiRepoScenario();
	scenario.host.db
		.update(repositories)
		.set({ remoteName: "upstream" })
		.where(eq(repositories.id, scenario.apiId))
		.run();
	const remote = mkdtempSync(join(tmpdir(), "multi-repo-remote-"));
	scenario.cleanup.push(remote);
	await simpleGit(remote).init(["--bare"]);
	const { api } = scenario;
	await api.git.addRemote("upstream", remote);
	await api.git.checkoutLocalBranch("superset/move");
	const moved = await api.commit("moved work", { "moved.txt": "moved\n" });
	await api.git.push("upstream", "superset/move");
	await api.git.checkout("main");
	await api.git.deleteLocalBranch("superset/move", true);

	const { workspace } = await scenario.host.trpc.workspaces.create.mutate({
		projectId: scenario.projectId,
		branch: "superset/move",
	});

	const apiCheckout = workspace.checkouts.find(
		(checkout) => checkout.repositoryId === scenario.apiId,
	);
	expect((await headOf(apiCheckout?.path ?? "")).oid).toStartWith(moved);
});

test("a branch rename or checkout in one checkout broadcasts the workspace and updates its AGENTS.md", async () => {
	const scenario = await multiRepoScenario();
	const workspace = await createBoth(scenario);
	await scenario.api.git.branch(["other"]);
	const broadcast = spyOn(scenario.host.eventBus, "broadcastWorkspaceChanged");
	const apiBranch = () => {
		const event = broadcast.mock.calls.at(-1)?.[0];
		return event?.workspace?.checkouts.find(
			(checkout) => checkout.repositoryId === scenario.apiId,
		)?.branch;
	};
	const apiPath = join(workspace.worktreePath, "api");
	const agentsFile = () =>
		readFileSync(join(workspace.worktreePath, "AGENTS.md"), "utf8");
	try {
		await scenario.host.trpc.git.renameBranch.mutate({
			workspaceId: workspace.id,
			repositoryId: scenario.apiId,
			oldName: "feature/both",
			newName: "feature/renamed",
		});
		expect(apiBranch()).toBe("feature/renamed");
		expect(agentsFile()).toContain(`| api | ${apiPath} | feature/renamed |`);

		await scenario.host.trpc.git.checkoutBranch.mutate({
			workspaceId: workspace.id,
			repositoryId: scenario.apiId,
			branch: "other",
		});
		expect(apiBranch()).toBe("other");
		expect(agentsFile()).toContain(`| api | ${apiPath} | other |`);
	} finally {
		broadcast.mockRestore();
	}
});

test("issue content comes from the primary repository unless repositoryId names another", async () => {
	const repos: string[] = [];
	const scenario = await multiRepoScenario({
		execGh: async (args) => {
			if (args[0] !== "issue") throw new Error(`unexpected gh call: ${args}`);
			repos.push(args[args.indexOf("--repo") + 1] ?? "");
			return {
				number: 3,
				title: "Bug",
				body: "",
				url: "https://github.com/o/x/issues/3",
				state: "OPEN",
			};
		},
	});
	await scenario.web.git.addRemote("origin", "https://github.com/o/web.git");
	await scenario.api.git.addRemote("origin", "https://github.com/o/api.git");

	await scenario.host.trpc.issues.getContent.query({
		projectId: scenario.projectId,
		issueNumber: 3,
	});
	await scenario.host.trpc.issues.getContent.query({
		projectId: scenario.projectId,
		issueNumber: 3,
		repositoryId: scenario.apiId,
	});

	expect(repos).toEqual(["o/web", "o/api"]);
});

test("adopt on a multi-repo project points to workspaces.create", async () => {
	const scenario = await multiRepoScenario();

	await expect(
		scenario.host.trpc.workspaceCreation.adopt.mutate({
			projectId: scenario.projectId,
			workspaceName: "x",
			branch: "feature/x",
		}),
	).rejects.toThrow(/checkouts\[repositoryId\]\.worktreePath/);
});
