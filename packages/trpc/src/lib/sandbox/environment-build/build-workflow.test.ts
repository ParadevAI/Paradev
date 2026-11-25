import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { SelectEnvironmentBuild } from "@superset/db/schema";
import { APIError, Sandbox } from "@vercel/sandbox";
import * as workflow from "workflow";
import { FatalError } from "workflow";
import { stub } from "../../../../test/stub";
import * as resolveEnvironmentModule from "../../../router/environment/resolve-environment";
import { TIMED_OUT_EXIT_CODE } from "../build-command";
import * as credentials from "../credentials";
import * as repoHooks from "../repo-hooks";
import * as repositories from "../repositories";
import * as vercel from "../vercel";
import * as steps from "./build-steps";
import * as deployment from "./deployment";
import { BUILD_LIMIT_MESSAGE, BUILD_LIMIT_MS } from "./limits";
import * as store from "./store";

const ENVIRONMENT_ID = "00000000-0000-0000-0000-0000000000e1";
const BUILD_ID = "00000000-0000-0000-0000-0000000000b1";
const BOX = "envb-000000000000000000000000";
const COMMIT = "a".repeat(40);
const CHECKOUT_MS = 1_000;
const STOP_MS = 3_000;
const MAX_ATTEMPTS = 4;

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
		error: null,
		startedAt: new Date(0),
		finishedAt: null,
		goldenDeletedAt: null,
		...overrides,
	};
}

type Environment = NonNullable<
	Awaited<ReturnType<typeof store.loadBuild>>
>["environment"];

function makeEnvironment(sourceKind: "fork" | "image"): Environment {
	return {
		id: ENVIRONMENT_ID,
		organizationId: "org",
		sourceKind,
		sourceRef: sourceKind === "fork" ? "env-old" : "superset-image",
		region: "iad1",
	} as unknown as Environment;
}

interface Command {
	startedAt: number;
	durationMs: number;
	exitCode: number;
	output: string;
}

let now: number;
let environment: Environment;
let build: SelectEnvironmentBuild;
let calls: string[];
let boxesCreated: number;
let boxes: Set<string>;
let commands: Map<string, Command>;
let stoppedAt: number | null;
let install: { durationMs: number; exitCode: number; output: string };
let failNext: Partial<Record<string, number>>;
let swapAllowed: boolean;
let rootDiskAgents: string;
let production: boolean;
let goldens: Array<{ id: string; goldenRef: string }>;
let deleteFails: Set<string>;
let goldensDeleted: string[];

function failOnce(name: string): void {
	const left = failNext[name] ?? 0;
	if (left > 0) {
		failNext[name] = left - 1;
		throw new Error(`${name} lost its answer`);
	}
}

const notFound = () => new APIError(new Response(null, { status: 404 }));

stub(Sandbox, {
	get: async ({ name }: { name: string }) => {
		if (!boxes.has(name)) throw notFound();
		return {};
	},
	fork: async ({ name }: { name: string }) => {
		boxes.add(name);
		boxesCreated++;
		calls.push("create");
		failOnce("fork");
	},
	create: async ({ name }: { name: string }) => {
		boxes.add(name);
		boxesCreated++;
		calls.push(`create:image:${name}`);
	},
});

stub(vercel, {
	startBuildCommand: async ({
		key,
		timeoutSeconds,
	}: {
		key: string;
		timeoutSeconds: number;
	}) => {
		calls.push(`start:${key}`);
		if (commands.has(key)) return;
		const spec =
			key === "checkout"
				? { durationMs: CHECKOUT_MS, exitCode: 0, output: COMMIT }
				: install;
		const timedOut = spec.durationMs > timeoutSeconds * 1000;
		commands.set(key, {
			startedAt: now,
			durationMs: timedOut ? timeoutSeconds * 1000 : spec.durationMs,
			exitCode: timedOut ? TIMED_OUT_EXIT_CODE : spec.exitCode,
			output: spec.output,
		});
	},
	readBuildCommand: async ({ key }: { key: string }) => {
		failOnce("read");
		const command = commands.get(key);
		if (!command) throw new Error(`${key} never started`);
		const done = now - command.startedAt >= command.durationMs;
		return { exitCode: done ? command.exitCode : null, tail: command.output };
	},
	buildBoxRootDiskAgents: async () => rootDiskAgents,
	buildBoxSnapshotId: async () => "snap-before",
	stopBuildBox: async () => {
		calls.push("stop");
		stoppedAt ??= now;
	},
	buildBoxSnapshotTaken: async () =>
		stoppedAt !== null && now - stoppedAt >= STOP_MS,
	deleteSandbox: async (name: string) => {
		if (deleteFails.has(name)) throw new Error(`could not delete ${name}`);
		if (!boxes.has(name)) return;
		calls.push(`delete:${name}`);
		boxes.delete(name);
	},
});

stub(store, {
	loadBuild: async () => ({ build, environment }),
	recordBuildCommit: async (_id: string, commitSha: string) => {
		build = { ...build, commitSha };
	},
	failBuild: async (_id: string, error: string) => {
		if (build.status === "running") {
			build = { ...build, status: "failed", error };
		}
	},
	succeedBuild: async ({ goldenRef }: { goldenRef: string }) => {
		if (!swapAllowed) return false;
		calls.push("activate");
		build = { ...build, status: "succeeded", goldenRef };
		failOnce("activate");
		return true;
	},
	undeletedGoldens: async () => goldens,
	markGoldenDeleted: async (id: string) => {
		goldensDeleted.push(id);
	},
	markBuildFresh: async () => {
		calls.push("fresh");
		build = { ...build, kind: "fresh" };
		return true;
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
});
stub(repoHooks, {
	environmentHooks: async () => ({ install: { commands: ["bun install"] } }),
});
stub(resolveEnvironmentModule, { resolveEnvironment: async () => null });
stub(credentials, {
	deriveSandboxCredentials: async () => ({
		networkPolicy: "allow-all",
		managedEnv: {},
		files: [],
	}),
});

stub(deployment, { isProductionDeployment: () => production });

stub(workflow, {
	sleep: async (ms: number) => {
		now += ms;
	},
});

// The runtime retries a step that throws anything but a FatalError.
const realSteps = { ...steps } as Record<
	string,
	(...args: unknown[]) => unknown
>;
stub(
	steps,
	Object.fromEntries(
		Object.entries(realSteps).map(([name, step]) => [
			name,
			async (...args: unknown[]) => {
				for (let attempt = 1; ; attempt++) {
					try {
						return await step(...args);
					} catch (error) {
						if (FatalError.is(error) || attempt === MAX_ATTEMPTS) throw error;
					}
				}
			},
		]),
	),
);

const { environmentBuildWorkflow } = await import("./build-workflow");

beforeEach(() => {
	now = 1_000_000;
	spyOn(Date, "now").mockImplementation(() => now);
	environment = makeEnvironment("fork");
	build = makeBuild();
	calls = [];
	boxesCreated = 0;
	boxes = new Set();
	commands = new Map();
	stoppedAt = null;
	install = { durationMs: 60_000, exitCode: 0, output: "installed" };
	failNext = {};
	swapAllowed = true;
	rootDiskAgents = "";
	production = true;
	goldens = [];
	deleteFails = new Set();
	goldensDeleted = [];
});

afterEach(() => {
	(Date.now as unknown as { mockRestore: () => void }).mockRestore();
});

describe("environmentBuildWorkflow", () => {
	test("forks the golden, runs [install] on the box, snapshots and activates", async () => {
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(calls).toEqual([
			"create",
			"start:checkout",
			"start:install",
			"stop",
			"activate",
		]);
		expect(build).toMatchObject({
			status: "succeeded",
			goldenRef: BOX,
			commitSha: COMMIT,
		});
	});

	test("an [install] far past the old 285 s budget still succeeds", async () => {
		install = { ...install, durationMs: 8 * 60_000 };
		const started = now;
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(now - started).toBeGreaterThan(8 * 60_000);
	});

	test("an [install] that fails keeps the golden and deletes the box", async () => {
		install = { durationMs: 5_000, exitCode: 2, output: "boom" };
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("failed");
		expect(build.error).toBe("[install] exited with 2:\nboom");
		expect(calls).not.toContain("stop");
		expect(calls.at(-1)).toBe(`delete:${BOX}`);
	});

	test("a lost answer is retried without a second box or a second swap", async () => {
		failNext = { fork: 1, read: 2, activate: 1 };
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(boxesCreated).toBe(1);
		expect(calls.filter((call) => call === "activate")).toHaveLength(1);
		expect(build.status).toBe("succeeded");
	});

	test("an [install] that outlasts the build limit is stopped with a clear reason", async () => {
		install = { ...install, durationMs: BUILD_LIMIT_MS * 2 };
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("failed");
		expect(build.error).toBe(BUILD_LIMIT_MESSAGE);
		expect(calls.at(-1)).toBe(`delete:${BOX}`);
	});

	test("a step that keeps failing ends in one cleanup", async () => {
		failNext = { read: MAX_ATTEMPTS };
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("failed");
		expect(build.error).toBe("The build stopped unexpectedly");
		expect(boxes.size).toBe(0);
		expect(calls.filter((call) => call.startsWith("delete"))).toHaveLength(1);
	});

	test("a build marked failed meanwhile stops at its next step", async () => {
		const read = vercel.readBuildCommand;
		spyOn(vercel, "readBuildCommand").mockImplementationOnce(async (args) => {
			build = { ...build, status: "failed", error: "Cancelled" };
			return read(args);
		});
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("failed");
		expect(build.error).toBe("Cancelled");
		expect(calls).not.toContain("start:install");
		expect(calls.at(-1)).toBe(`delete:${BOX}`);
	});

	test("an environment that moved meanwhile keeps its golden", async () => {
		swapAllowed = false;
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("failed");
		expect(build.error).toBe(
			"The environment changed during the build; its current snapshot was kept",
		);
		expect(calls.at(-1)).toBe(`delete:${BOX}`);
	});

	test("a finished build is skipped", async () => {
		build = makeBuild({ status: "succeeded" });
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("skipped");
		expect(calls).toEqual([]);
	});

	test("an environment with no golden is built from the image", async () => {
		environment = makeEnvironment("image");
		build = makeBuild({ kind: "fresh" });
		rootDiskAgents = "/opt/codex";
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(calls[0]).toBe(`create:image:${BOX}-fresh`);
		expect(calls).not.toContain("fresh");
		expect(build.goldenRef).toBe(`${BOX}-fresh`);
	});

	test("a fork with agent CLIs on its disk is rebuilt from the image", async () => {
		rootDiskAgents = "/opt/codex\n/opt/pdev";

		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(calls.slice(0, 5)).toEqual([
			"create",
			"fresh",
			`delete:${BOX}`,
			`create:image:${BOX}-fresh`,
			"start:checkout",
		]);
		expect(build).toMatchObject({
			status: "succeeded",
			kind: "fresh",
			goldenRef: `${BOX}-fresh`,
		});
	});

	test("a clean fork stays incremental", async () => {
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(calls).not.toContain("fresh");
		expect(build.kind).toBe("incremental");
	});

	describe("old goldens", () => {
		const fourGoldens = () => [
			{ id: "b4", goldenRef: "env-new" },
			{ id: "b3", goldenRef: "env-old" },
			{ id: "b2", goldenRef: "env-older" },
			{ id: "b1", goldenRef: "env-oldest" },
		];

		beforeEach(() => {
			environment = { ...environment, sourceRef: "env-new" };
			goldens = fourGoldens();
			for (const golden of goldens) boxes.add(golden.goldenRef);
		});

		test("a build deletes the golden past the three it keeps, last", async () => {
			expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
			expect(goldensDeleted).toEqual(["b1"]);
			expect(calls.slice(-2)).toEqual(["activate", "delete:env-oldest"]);
		});

		test("a failed delete is not marked and does not fail the build", async () => {
			deleteFails = new Set(["env-oldest"]);
			expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
			expect(goldensDeleted).toEqual([]);
			expect(build.status).toBe("succeeded");
		});

		test("a non-production build deletes nothing", async () => {
			production = false;
			expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
			expect(goldensDeleted).toEqual([]);
			expect(calls.some((call) => call === "delete:env-oldest")).toBe(false);
		});
	});
});
