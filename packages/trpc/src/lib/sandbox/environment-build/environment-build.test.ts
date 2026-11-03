import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { SelectEnvironmentBuild } from "@superset/db/schema";
import { stub } from "../../../../test/stub";
import * as resolveEnvironmentModule from "../../../router/environment/resolve-environment";
import * as credentials from "../credentials";
import * as repoHooks from "../repo-hooks";
import * as repositories from "../repositories";
import * as vercel from "../vercel";
import * as store from "./store";

const ENVIRONMENT_ID = "00000000-0000-0000-0000-0000000000e1";
const BUILD_ID = "00000000-0000-0000-0000-0000000000b1";
const BOX = "envb-000000000000000000000000";
const COMMIT = "a".repeat(40);

function makeBuild(
	overrides: Partial<SelectEnvironmentBuild> = {},
): SelectEnvironmentBuild {
	return {
		id: BUILD_ID,
		environmentId: ENVIRONMENT_ID,
		organizationId: "org",
		status: "running",
		trigger: "manual",
		kind: "incremental",
		repositoryIds: ["repo"],
		primaryRepositoryId: "repo",
		commitSha: null,
		goldenRef: null,
		goldenDeletedAt: null,
		error: null,
		startedAt: new Date(0),
		finishedAt: null,
		...overrides,
	};
}

const environment = {
	id: ENVIRONMENT_ID,
	organizationId: "org",
	sourceKind: "fork",
	sourceRef: "env-old",
	region: "iad1",
} as unknown as NonNullable<
	Awaited<ReturnType<typeof store.loadBuild>>
>["environment"];

let build: SelectEnvironmentBuild;
let history: SelectEnvironmentBuild[];
let calls: string[];
let swapAllowed: boolean;
let install: vercel.BuildCommandResult;
let installCommands: string[] | null;
let afterInstall: () => void;

const ok = (output = ""): vercel.BuildCommandResult => ({
	exitCode: 0,
	output,
	timedOut: false,
});

stub(store, {
	loadBuild: async () => ({ build, environment }),
	recordBuildCommit: async (_id: string, commitSha: string) => {
		build = { ...build, commitSha };
	},
	failBuild: async (_id: string, error: string) => {
		build = { ...build, status: "failed", error };
	},
	succeedBuild: async ({ goldenRef }: { goldenRef: string }) => {
		if (!swapAllowed) return false;
		build = { ...build, status: "succeeded", goldenRef };
		history = [build, ...history];
		return true;
	},
	finishedBuilds: async () => history,
	markGoldensDeleted: async (ids: readonly string[]) => {
		calls.push(`marked:${ids.join(",")}`);
	},
});
stub(vercel, {
	createBuildBox: async ({ source }: { source: vercel.BuildBoxSource }) => {
		calls.push(
			`create:${source.kind === "fork" ? source.golden : source.region}`,
		);
	},
	runBuildCommand: async ({
		script,
		cwd,
	}: {
		script: string;
		cwd?: string;
	}) => {
		if (script.includes("rev-parse")) {
			calls.push("checkout");
			return ok(`${COMMIT}\n`);
		}
		calls.push(`install:${cwd}`);
		afterInstall();
		return install;
	},
	snapshotBuildBox: async () => {
		calls.push("snapshot");
	},
	deleteSandbox: async (name: string) => {
		calls.push(`remove:${name}`);
	},
});
stub(repositories, {
	loadRepositories: async () => [
		{
			id: "repo",
			owner: "acme",
			name: "web",
			fullName: "acme/web",
			defaultBranch: "main",
		},
	],
	installationTokenFor: async () => null,
	environmentRepositoryRows: async () => [],
});
stub(repoHooks, {
	readRepoHooks: async () =>
		installCommands ? { install: { commands: installCommands } } : null,
});
stub(resolveEnvironmentModule, { resolveEnvironment: async () => null });
stub(credentials, {
	deriveSandboxCredentials: async () => ({
		networkPolicy: "allow-all",
		managedEnv: {},
		files: [],
	}),
});

const { rebuildEnvironment } = await import("./environment-build");

beforeEach(() => {
	build = makeBuild();
	history = [];
	calls = [];
	swapAllowed = true;
	install = ok();
	installCommands = ["bun install"];
	afterInstall = () => {};
});

afterEach(() => {
	(Date.now as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe("rebuildEnvironment", () => {
	test("forks the golden, installs, snapshots and makes the result active", async () => {
		expect(await rebuildEnvironment({ buildId: BUILD_ID })).toBe("succeeded");
		expect(calls).toEqual([
			"create:env-old",
			"checkout",
			"install:/workspace",
			"snapshot",
			"marked:",
		]);
		expect(build).toMatchObject({
			status: "succeeded",
			goldenRef: BOX,
			commitSha: COMMIT,
		});
	});

	test("a fresh build starts from the image in the environment's region", async () => {
		build = makeBuild({ kind: "fresh" });
		await rebuildEnvironment({ buildId: BUILD_ID });
		expect(calls[0]).toBe("create:iad1");
	});

	test("an [install] that fails keeps the golden and deletes the box", async () => {
		install = { exitCode: 2, output: "boom\n", timedOut: false };
		expect(await rebuildEnvironment({ buildId: BUILD_ID })).toBe("failed");
		expect(build.error).toBe("[install] exited with 2:\nboom");
		expect(calls).not.toContain("snapshot");
		expect(calls.at(-1)).toBe(`remove:${BOX}`);
	});

	test("an [install] past its limit says so", async () => {
		install = { exitCode: 137, output: "", timedOut: true };
		await rebuildEnvironment({ buildId: BUILD_ID });
		expect(build.error).toStartWith(
			"[install] ran for more than 180 seconds and was stopped",
		);
	});

	test("an [install] that uses up the job's time fails before the snapshot", async () => {
		const start = Date.now();
		afterInstall = () => {
			spyOn(Date, "now").mockReturnValue(start + 300_000);
		};
		await rebuildEnvironment({ buildId: BUILD_ID });
		expect(build.error).toBe(
			"The build ran out of time before the snapshot (285 seconds)",
		);
		expect(calls).not.toContain("snapshot");
	});

	test("no [install] fails before any box is made", async () => {
		installCommands = null;
		await rebuildEnvironment({ buildId: BUILD_ID });
		expect(build.error).toBe(
			"No [install] in .paradev/config.toml on acme/web@main",
		);
		expect(calls).toEqual([]);
	});

	test("an environment that moved meanwhile keeps its golden", async () => {
		swapAllowed = false;
		expect(await rebuildEnvironment({ buildId: BUILD_ID })).toBe("failed");
		expect(build.error).toBe(
			"The environment changed during the build; its current snapshot was kept",
		);
		expect(calls.at(-1)).toBe(`remove:${BOX}`);
	});

	test("a redelivered job for a finished build does nothing", async () => {
		build = makeBuild({ status: "succeeded" });
		expect(await rebuildEnvironment({ buildId: BUILD_ID })).toBe("skipped");
		expect(calls).toEqual([]);
	});

	test("deletes goldens past the newest five once the new one is active", async () => {
		history = ["g5", "g4", "g3", "g2", "g1"].map((goldenRef, index) =>
			makeBuild({ id: `old-${index}`, status: "succeeded", goldenRef }),
		);
		await rebuildEnvironment({ buildId: BUILD_ID });
		expect(calls.slice(-2)).toEqual(["remove:g1", "marked:old-4"]);
	});
});
