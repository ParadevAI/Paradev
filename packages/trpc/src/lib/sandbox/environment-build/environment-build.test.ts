import { beforeEach, describe, expect, test } from "bun:test";
import type { SelectEnvironmentBuild } from "@superset/db/schema";
import type { BuildCommandResult } from "../vercel";
import {
	type BuildDeps,
	type BuildInputs,
	buildBoxName,
	rebuildEnvironment,
} from "./environment-build";
import type { BuildStore } from "./store";

const ENVIRONMENT_ID = "00000000-0000-0000-0000-0000000000e1";
const BUILD_ID = "00000000-0000-0000-0000-0000000000b1";
const COMMIT = "a".repeat(40);

function makeBuild(
	overrides: Partial<SelectEnvironmentBuild> = {},
): SelectEnvironmentBuild {
	return {
		id: BUILD_ID,
		environmentId: ENVIRONMENT_ID,
		organizationId: "org",
		startedByUserId: null,
		status: "running",
		trigger: "manual",
		kind: "incremental",
		repositoryIds: ["repo"],
		primaryRepositoryId: "repo",
		baseBranch: "main",
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
	sourceKind: "fork",
	sourceRef: "env-old",
	region: "iad1",
} as unknown as NonNullable<
	Awaited<ReturnType<BuildStore["load"]>>
>["environment"];

let build: SelectEnvironmentBuild;
let history: SelectEnvironmentBuild[];
let calls: string[];
let swapAllowed: boolean;
let installResult: BuildCommandResult;
let inputs: BuildInputs;

const ok = (output = ""): BuildCommandResult => ({
	exitCode: 0,
	output,
	timedOut: false,
});

function deps(): BuildDeps {
	return {
		budgets: {
			boxReadyMs: 50,
			checkoutMs: 50,
			installMs: 50,
			snapshotMs: 50,
		},
		prepare: async () => inputs,
		store: {
			load: async () => ({ build, environment }),
			recordCommit: async (_id, sha) => {
				build = { ...build, commitSha: sha };
			},
			fail: async (_id, error) => {
				build = { ...build, status: "failed", error };
			},
			succeed: async ({ goldenRef }) => {
				if (!swapAllowed) return false;
				build = { ...build, status: "succeeded", goldenRef };
				history = [build, ...history];
				return true;
			},
			builds: async () => history,
			markGoldensDeleted: async (ids) => {
				calls.push(`marked:${ids.join(",")}`);
			},
		},
		box: {
			create: async ({ source }) => {
				calls.push(
					`create:${source.kind === "fork" ? source.golden : source.region}`,
				);
			},
			run: async ({ script, cwd }) => {
				if (script.includes("rev-parse")) {
					calls.push("checkout");
					return ok(`${COMMIT}\n`);
				}
				calls.push(`install:${cwd}`);
				return installResult;
			},
			snapshot: async () => {
				calls.push("snapshot");
			},
			remove: async (name) => {
				calls.push(`remove:${name}`);
			},
		},
	};
}

beforeEach(() => {
	build = makeBuild();
	history = [];
	calls = [];
	swapAllowed = true;
	installResult = ok();
	inputs = {
		install: { commands: ["bun install"] },
		installSource: "acme/web@main",
		checkouts: [
			{ url: "https://github.com/acme/web.git", branch: "main", path: "." },
		],
		networkPolicy: "allow-all",
		env: {},
	};
});

describe("rebuildEnvironment", () => {
	test("forks the golden, installs, snapshots and makes the result active", async () => {
		expect(await rebuildEnvironment({ buildId: BUILD_ID }, deps())).toBe(
			"succeeded",
		);
		expect(calls).toEqual([
			"create:env-old",
			"checkout",
			"install:/workspace",
			"snapshot",
			"marked:",
		]);
		expect(build).toMatchObject({
			status: "succeeded",
			goldenRef: buildBoxName(BUILD_ID),
			commitSha: COMMIT,
		});
	});

	test("a fresh build starts from the image in the environment's region", async () => {
		build = makeBuild({ kind: "fresh" });
		await rebuildEnvironment({ buildId: BUILD_ID }, deps());
		expect(calls[0]).toBe("create:iad1");
	});

	test("runs [install] in its cwd under the primary checkout", async () => {
		inputs = { ...inputs, install: { commands: ["x"], cwd: "apps/web" } };
		await rebuildEnvironment({ buildId: BUILD_ID }, deps());
		expect(calls).toContain("install:/workspace/apps/web");
	});

	test("an [install] that fails keeps the golden and deletes the box", async () => {
		installResult = { exitCode: 2, output: "boom\n", timedOut: false };
		expect(await rebuildEnvironment({ buildId: BUILD_ID }, deps())).toBe(
			"failed",
		);
		expect(build.status).toBe("failed");
		expect(build.error).toBe("[install] exited with 2:\nboom");
		expect(calls).not.toContain("snapshot");
		expect(calls.at(-1)).toBe(`remove:${buildBoxName(BUILD_ID)}`);
	});

	test("an [install] past its budget says so", async () => {
		installResult = { exitCode: 137, output: "", timedOut: true };
		await rebuildEnvironment({ buildId: BUILD_ID }, deps());
		expect(build.error).toStartWith(
			"[install] ran for more than 0 seconds and was stopped",
		);
	});

	test("no [install] fails before any box is made", async () => {
		inputs = { ...inputs, install: null };
		await rebuildEnvironment({ buildId: BUILD_ID }, deps());
		expect(build.error).toBe(
			"No [install] in .superset/config.toml on acme/web@main",
		);
		expect(calls).toEqual([]);
	});

	test("a box that is not ready in time fails the build", async () => {
		const slow = deps();
		slow.box.create = () => new Promise(() => {});
		await rebuildEnvironment({ buildId: BUILD_ID }, slow);
		expect(build.error).toBe("The box was not ready within 0 seconds");
	});

	test("an environment that moved meanwhile keeps its golden", async () => {
		swapAllowed = false;
		expect(await rebuildEnvironment({ buildId: BUILD_ID }, deps())).toBe(
			"failed",
		);
		expect(build.error).toBe(
			"The environment changed during the build; its current snapshot was kept",
		);
		expect(calls.at(-1)).toBe(`remove:${buildBoxName(BUILD_ID)}`);
	});

	test("a redelivered job for a finished build does nothing", async () => {
		build = makeBuild({ status: "succeeded" });
		expect(await rebuildEnvironment({ buildId: BUILD_ID }, deps())).toBe(
			"skipped",
		);
		expect(calls).toEqual([]);
	});

	test("deletes goldens past the newest five once the new one is active", async () => {
		history = ["g5", "g4", "g3", "g2", "g1"].map((goldenRef, index) =>
			makeBuild({
				id: `old-${index}`,
				status: "succeeded",
				goldenRef,
			}),
		);
		await rebuildEnvironment({ buildId: BUILD_ID }, deps());
		expect(calls.slice(-2)).toEqual(["remove:g1", "marked:old-4"]);
	});
});
