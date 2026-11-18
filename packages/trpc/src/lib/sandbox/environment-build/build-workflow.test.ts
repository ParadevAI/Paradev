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
import {
	BUILD_LIMIT_MESSAGE,
	BUILD_LIMIT_MS,
	FRESH_REBUILD_WAIT_MS,
} from "./limits";
import type { FreshRebuildClaim } from "./policy";
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
		goldenDeletedAt: null,
		error: null,
		log: null,
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

interface Command {
	startedAt: number;
	durationMs: number;
	exitCode: number;
	output: string;
}

let now: number;
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
let claims: FreshRebuildClaim[];

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
		if (!boxes.has(name)) return;
		calls.push(`delete:${name}`);
		boxes.delete(name);
	},
});

stub(store, {
	loadBuild: async () => ({ build, environment }),
	recordBuildLog: async (_id: string, log: string) => {
		if (build.status !== "running") return false;
		build = { ...build, log };
		return true;
	},
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
	claimFreshRebuild: async () => {
		const claim = claims.shift() ?? "wait";
		calls.push(`claim:${claim}`);
		if (claim === "claimed") build = { ...build, kind: "fresh" };
		return claim;
	},
	restartBuildClock: async () => {},
	finishedBuilds: async () => [],
	markGoldensDeleted: async () => {},
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
	readRepoHooks: async () => ({ install: { commands: ["bun install"] } }),
});
stub(resolveEnvironmentModule, { resolveEnvironment: async () => null });
stub(credentials, {
	deriveSandboxCredentials: async () => ({
		networkPolicy: "allow-all",
		managedEnv: {},
		files: [],
	}),
});

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
	claims = [];
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
			log: "installed",
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

	test("a fork with agent CLIs on its disk is rebuilt from the image", async () => {
		rootDiskAgents = "/opt/codex\n/opt/pdev";
		claims = ["claimed"];
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(calls.slice(0, 5)).toEqual([
			"create",
			`delete:${BOX}`,
			"claim:claimed",
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
		expect(calls.some((call) => call.startsWith("claim"))).toBe(false);
		expect(build.kind).toBe("incremental");
	});

	test("past the caps the build forks as before and the golden waits for the next run", async () => {
		rootDiskAgents = "/opt/codex";
		const started = now;
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(now - started).toBeGreaterThanOrEqual(FRESH_REBUILD_WAIT_MS);
		expect(calls.filter((call) => call === "create")).toHaveLength(2);
		expect(calls.some((call) => call.startsWith("create:image"))).toBe(false);
		expect(build.kind).toBe("incremental");
	});

	test("a build refused a fresh slot does not wait", async () => {
		rootDiskAgents = "/opt/codex";
		claims = ["refused"];
		const started = now;
		expect(await environmentBuildWorkflow(BUILD_ID)).toBe("succeeded");
		expect(calls.filter((call) => call.startsWith("claim"))).toEqual([
			"claim:refused",
		]);
		expect(now - started).toBeLessThan(FRESH_REBUILD_WAIT_MS);
	});
});
