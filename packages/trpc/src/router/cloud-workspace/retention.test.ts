import { describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import type { TaggedSandbox } from "../../lib/sandbox";
import {
	ORPHAN_BATCH,
	RETENTION_IDLE_MS,
	type RetentionDeps,
	RUN_BUDGET_MS,
	reapCloudWorkspaceRetention,
	retireIdleWorkspace,
} from "./retention";
import * as transition from "./transition";

const NOW = Date.parse("2026-11-18T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const idleRow = (n: number) => ({
	id: `ws_${n}`,
	organizationId: "org_1",
	providerSandboxId: `ws-box${n}`,
});

const box = (name: string, overrides: Partial<TaggedSandbox> = {}) => ({
	name,
	createdAt: NOW - 60 * DAY,
	statusUpdatedAt: NOW - 40 * DAY,
	status: "stopped",
	snapshotExpiration: 0,
	...overrides,
});

function fakeDeps(overrides: Partial<RetentionDeps> = {}) {
	const queued: Array<[string, number]> = [];
	const retired: string[] = [];
	const deps: RetentionDeps = {
		findIdleWorkspaces: async () => [],
		retireIdleWorkspace: async (row) => {
			retired.push(row.id);
			return true;
		},
		boxIsRunning: async () => false,
		listTaggedSandboxes: async () => [],
		namedSandboxes: async () => new Set(),
		queueTeardown: async (name, delaySeconds) => {
			queued.push([name, delaySeconds]);
		},
		...overrides,
	};
	return { deps, queued, retired };
}

describe("reapCloudWorkspaceRetention", () => {
	test("retires each idle workspace and queues its box's teardown a second apart", async () => {
		let cutoff: Date | undefined;
		const { deps, queued, retired } = fakeDeps({
			findIdleWorkspaces: async (at) => {
				cutoff = at;
				return [idleRow(1), idleRow(2)];
			},
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: false,
			deps,
		});
		expect(cutoff?.getTime()).toBe(NOW - RETENTION_IDLE_MS);
		expect(retired).toEqual(["ws_1", "ws_2"]);
		expect(queued).toEqual([
			["ws-box1", 0],
			["ws-box2", 1],
		]);
		expect(run.idle).toMatchObject({ found: 2, retired: 2 });
	});

	test("a box that runs a session now is skipped, not retired", async () => {
		const { deps, queued, retired } = fakeDeps({
			findIdleWorkspaces: async () => [idleRow(1)],
			boxIsRunning: async () => true,
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: false,
			deps,
		});
		expect(retired).toEqual([]);
		expect(queued).toEqual([]);
		expect(run.idle.skippedRunning).toBe(1);
	});

	test("a row woken or changed after it was read keeps its box", async () => {
		const { deps, queued } = fakeDeps({
			findIdleWorkspaces: async () => [idleRow(1)],
			retireIdleWorkspace: async () => false,
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: false,
			deps,
		});
		expect(queued).toEqual([]);
		expect(run.idle.skippedChanged).toBe(1);
	});

	test("queues only old, settled boxes no row names, and not one it just retired", async () => {
		const { deps, queued } = fakeDeps({
			findIdleWorkspaces: async () => [idleRow(1)],
			listTaggedSandboxes: async (kind) =>
				kind === "workspace"
					? [
							box("ws-box1"),
							box("ws-orphan"),
							box("ws-named"),
							box("ws-young", { createdAt: NOW - DAY }),
							box("ws-recent", { statusUpdatedAt: NOW - DAY }),
							box("ws-running", { status: "running" }),
						]
					: [box("env-orphan")],
			namedSandboxes: async () => new Set(["ws-named"]),
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: true,
			deps,
		});
		expect(queued).toEqual([
			["ws-box1", 0],
			["ws-orphan", 1],
			["env-orphan", 2],
		]);
		expect(run.orphans).toEqual({
			listed: 7,
			orphaned: 2,
			queued: 2,
			deferred: 0,
			failed: 0,
		});
	});

	test("outside production it never looks for orphans", async () => {
		let listed = false;
		const { deps } = fakeDeps({
			listTaggedSandboxes: async () => {
				listed = true;
				return [box("ws-orphan")];
			},
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: false,
			deps,
		});
		expect(listed).toBe(false);
		expect(run.orphans).toEqual({ skipped: "not production" });
	});

	test("queues at most a batch of orphans a run and counts the rest", async () => {
		const many = Array.from({ length: ORPHAN_BATCH + 3 }, (_, i) =>
			box(`ws-orphan${i}`),
		);
		const { deps, queued } = fakeDeps({
			listTaggedSandboxes: async (kind) => (kind === "workspace" ? many : []),
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: true,
			deps,
		});
		expect(queued).toHaveLength(ORPHAN_BATCH);
		expect(run.orphans).toMatchObject({ queued: ORPHAN_BATCH, deferred: 3 });
	});

	test("stops starting work when its time is up and leaves the rest for the next run", async () => {
		let time = 0;
		const { deps, retired } = fakeDeps({
			findIdleWorkspaces: async () => [idleRow(1), idleRow(2), idleRow(3)],
			retireIdleWorkspace: async (row) => {
				retired.push(row.id);
				time += RUN_BUDGET_MS + 1;
				return true;
			},
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: false,
			deps,
			clock: () => time,
		});
		expect(retired).toEqual(["ws_1"]);
		expect(run.idle).toMatchObject({ retired: 1, deferred: 2 });
	});
});

describe("retireIdleWorkspace", () => {
	let failed: Parameters<typeof transition.failCloudWorkspace>[0] | undefined;
	stub(transition, {
		failCloudWorkspace: async (
			args: Parameters<typeof transition.failCloudWorkspace>[0],
		) => {
			failed = args;
			return true;
		},
	});

	test("fails the row as an expired snapshot and gives it a new box name in the same update", async () => {
		await retireIdleWorkspace(idleRow(1), new Date(NOW - RETENTION_IDLE_MS));
		expect(failed).toMatchObject({
			scope: { cloudWorkspaceId: "ws_1", organizationId: "org_1" },
			from: ["asleep"],
			reason: "snapshot_expired",
			expected: true,
			set: { sandboxUrl: null },
		});
		expect(failed?.set?.providerSandboxId).toMatch(/^ws-ws_1[0-9a-f]{8}$/);
		expect(failed?.set?.providerSandboxId).not.toBe("ws-box1");
		expect(failed?.where).toBeDefined();
	});
});
