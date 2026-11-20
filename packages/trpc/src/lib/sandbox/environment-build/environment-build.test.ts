import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { SelectEnvironmentBuild } from "@superset/db/schema";
import { stub } from "../../../../test/stub";
import * as resolveEnvironmentModule from "../../../router/environment/resolve-environment";
import * as credentials from "../credentials";
import * as repositories from "../repositories";
import * as vercel from "../vercel";
import * as deployment from "./deployment";
import * as store from "./store";

const ENVIRONMENT_ID = "00000000-0000-0000-0000-0000000000e1";
const BUILD_ID = "00000000-0000-0000-0000-0000000000b1";
const SECOND_BUILD_ID = "10000000-0000-0000-0000-0000000000b2";
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

const baseEnvironment = {
	id: ENVIRONMENT_ID,
	organizationId: "org",
	sourceKind: "fork",
	sourceRef: "env-old",
	region: "iad1",
} as unknown as NonNullable<
	Awaited<ReturnType<typeof store.loadBuild>>
>["environment"];
let environment = baseEnvironment;

let build: SelectEnvironmentBuild;
let history: SelectEnvironmentBuild[];
let calls: string[];
let swapAllowed: boolean;
let install: vercel.BuildCommandResult;
let installCommands: string[] | null;
let afterInstall: () => void;
let production: boolean;
let deleteFails: Set<string>;

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
		history = history.map((row) =>
			ids.includes(row.id) ? { ...row, goldenDeletedAt: new Date(0) } : row,
		);
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
		if (deleteFails.has(name)) throw new Error(`could not delete ${name}`);
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
stub(resolveEnvironmentModule, {
	resolveEnvironment: async () => ({
		id: ENVIRONMENT_ID,
		provider: "vercel",
		sourceKind: "fork",
		sourceRef: "golden",
		region: "sfo1",
		bundleSha: "bundle",
		primaryRepositoryId: "repo",
		config: installCommands
			? `[install]\nrun = ${JSON.stringify(installCommands)}\n`
			: null,
		envs: {},
	}),
});
stub(credentials, {
	deriveSandboxCredentials: async () => ({
		networkPolicy: "allow-all",
		managedEnv: {},
		files: [],
	}),
});

stub(deployment, { isProductionDeployment: () => production });

const { pruneGoldens, rebuildEnvironment } = await import(
	"./environment-build"
);

beforeEach(() => {
	environment = baseEnvironment;
	build = makeBuild();
	history = [];
	calls = [];
	swapAllowed = true;
	install = ok();
	installCommands = ["bun install"];
	afterInstall = () => {};
	production = true;
	deleteFails = new Set();
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
		expect(build.error).toBe("No [install] in the environment's config");
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

	describe("old goldens", () => {
		beforeEach(() => {
			history = ["g3", "g2", "g1"].map((goldenRef, index) =>
				makeBuild({ id: `old-${index}`, status: "succeeded", goldenRef }),
			);
		});

		test("keeps three goldens", async () => {
			history = history.slice(0, 2);
			await rebuildEnvironment({ buildId: BUILD_ID });
			expect(calls.some((call) => call.startsWith("remove:g"))).toBe(false);
		});

		test("deletes the fourth once the new one is active", async () => {
			await rebuildEnvironment({ buildId: BUILD_ID });
			expect(calls.slice(-2)).toEqual(["remove:g1", "marked:old-2"]);
		});

		test("a failed delete is not marked and does not fail the build", async () => {
			deleteFails = new Set(["g1"]);
			expect(await rebuildEnvironment({ buildId: BUILD_ID })).toBe("succeeded");
			expect(calls.at(-1)).toBe("marked:");
		});

		test("a restored golden is kept while active and deleted once it is not", async () => {
			const environmentRef = (sourceRef: string) =>
				({ ...environment, sourceRef }) as typeof environment;
			environment = environmentRef("g1");
			await pruneGoldens({ environmentId: ENVIRONMENT_ID, activeRef: "g1" });
			expect(calls).toEqual([]);

			await rebuildEnvironment({ buildId: BUILD_ID });
			expect(calls).toContain("remove:g1");

			calls = [];
			environment = environmentRef(BOX);
			build = makeBuild({ id: SECOND_BUILD_ID });
			await rebuildEnvironment({ buildId: SECOND_BUILD_ID });
			expect(calls.filter((call) => call.startsWith("remove:g"))).toEqual([
				"remove:g2",
			]);
		});

		test("a non-production build deletes nothing", async () => {
			production = false;
			expect(await rebuildEnvironment({ buildId: BUILD_ID })).toBe("succeeded");
			expect(calls.some((call) => call.startsWith("remove:g"))).toBe(false);
			expect(calls.some((call) => call.startsWith("marked"))).toBe(false);
		});
	});
});
