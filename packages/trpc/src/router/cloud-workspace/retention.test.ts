import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import type { ListedSandbox } from "../../lib/sandbox";
import {
	ARCHIVED_BACKSTOP_AFTER_MS,
	findStranded,
	ORPHAN_BATCH,
	RETENTION_IDLE_MS,
	type RetentionDeps,
	RUN_BUDGET_MS,
	reapCloudWorkspaceRetention,
	retireIdleWorkspace,
	retireStrandedWorkspace,
	STRANDED_BATCH,
	STRANDED_PROVISIONING_MS,
	type StrandedWorkspace,
	TEARDOWN_SPACING_MS,
} from "./retention";
import * as teardown from "./teardown";
import * as transition from "./transition";

const NOW = Date.parse("2026-11-18T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const idleRow = (n: number) => ({
	id: `ws_${n}`,
	organizationId: "org_1",
	providerSandboxId: `ws-box${n}`,
});

const strandedRow = (
	id: string,
	providerSandboxId: string,
	status: StrandedWorkspace["status"],
): StrandedWorkspace => ({
	id,
	organizationId: "org_1",
	providerSandboxId,
	status,
});

const box = (
	name: string,
	overrides: Partial<ListedSandbox> = {},
): ListedSandbox => ({
	name,
	kind: "workspace",
	createdAt: NOW - 60 * DAY,
	statusUpdatedAt: NOW - 40 * DAY,
	status: "stopped",
	...overrides,
});

function fakeDeps(overrides: Partial<RetentionDeps> = {}) {
	const queued: string[] = [];
	const paused: number[] = [];
	const retired: string[] = [];
	const reaped: unknown[] = [];
	const deps: RetentionDeps = {
		findIdleWorkspaces: async () => [],
		retireIdleWorkspace: async (row) => {
			retired.push(row.id);
			return true;
		},
		boxIsRunning: async () => false,
		listAllSandboxes: async () => [],
		namedSandboxes: async () => new Set(),
		countArchivedPastGrace: async () => 0,
		findArchivedPastGraceAmong: async () => [],
		reapArchived: async (input) => {
			reaped.push(input);
			return "reaped";
		},
		reapUndatedArchived: async (input) => {
			reaped.push(input);
			return "reaped";
		},
		findStranded: async () => [],
		retireStrandedWorkspace: async (row) => {
			retired.push(row.id);
			return true;
		},
		tearDownOrphan: async (name) => {
			queued.push(name);
		},
		pause: async (ms) => {
			paused.push(ms);
		},
		...overrides,
	};
	return { deps, queued, paused, retired, reaped };
}

describe("reapCloudWorkspaceRetention", () => {
	test("retires each idle workspace, a pause apart", async () => {
		let cutoff: Date | undefined;
		const { deps, paused, retired } = fakeDeps({
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
		expect(paused).toEqual([TEARDOWN_SPACING_MS, TEARDOWN_SPACING_MS]);
		expect(run.idle).toMatchObject({ found: 2, retired: 2 });
	});

	test("a box that runs a session now is skipped, not retired", async () => {
		const { deps, retired } = fakeDeps({
			findIdleWorkspaces: async () => [idleRow(1)],
			boxIsRunning: async () => true,
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: false,
			deps,
		});
		expect(retired).toEqual([]);
		expect(run.idle.skippedRunning).toBe(1);
	});

	test("a row woken or changed after it was read keeps its box", async () => {
		const { deps, paused } = fakeDeps({
			findIdleWorkspaces: async () => [idleRow(1)],
			retireIdleWorkspace: async () => false,
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: false,
			deps,
		});
		expect(paused).toEqual([]);
		expect(run.idle.skippedChanged).toBe(1);
	});

	test("queues only old, settled boxes no row names, and not one it just retired", async () => {
		const { deps, queued } = fakeDeps({
			findIdleWorkspaces: async () => [idleRow(1)],
			listAllSandboxes: async () => [
				box("ws-box1"),
				box("ws-orphan"),
				box("ws-named"),
				box("ws-young", { createdAt: NOW - DAY }),
				box("ws-recent", { statusUpdatedAt: NOW - DAY }),
				box("ws-running", { status: "running" }),
				box("env-orphan", { kind: "environment" }),
				box("someone-elses", { kind: undefined }),
			],
			namedSandboxes: async () => new Set(["ws-named"]),
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: true,
			deps,
		});
		expect(queued).toEqual(["ws-orphan", "env-orphan"]);
		expect(run.orphans).toEqual({
			listed: 7,
			orphaned: 2,
			queued: 2,
			deferred: 0,
			failed: 0,
		});
	});

	test("outside production it touches no archived box and looks for no orphan", async () => {
		let listed = false;
		const { deps, reaped } = fakeDeps({
			listAllSandboxes: async () => {
				listed = true;
				return [box("ws-orphan")];
			},
			findArchivedPastGraceAmong: async () => [
				{ id: "ws_a", providerSandboxId: "ws-a", deletedAt: new Date(0) },
			],
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: false,
			deps,
		});
		expect(listed).toBe(false);
		expect(reaped).toEqual([]);
		expect(run.archived).toEqual({ skipped: "not production" });
		expect(run.stranded).toEqual({ skipped: "not production" });
		expect(run.orphans).toEqual({ skipped: "not production" });
	});

	test("retires failed and stranded rows that still name a box, a pause apart, and does not queue their boxes again as orphans", async () => {
		let asked: Parameters<RetentionDeps["findStranded"]>[0] | undefined;
		const { deps, retired, queued, paused } = fakeDeps({
			listAllSandboxes: async () => [box("ws-failed"), box("ws-stranded")],
			findStranded: async (args) => {
				asked = args;
				return [
					strandedRow("ws_f", "ws-failed", "failed"),
					strandedRow("ws_p", "ws-stranded", "provisioning"),
				];
			},
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: true,
			deps,
		});
		expect(asked).toEqual({
			failedCutoff: new Date(NOW - RETENTION_IDLE_MS),
			provisioningCutoff: new Date(NOW - STRANDED_PROVISIONING_MS),
			names: ["ws-failed", "ws-stranded"],
			limit: STRANDED_BATCH,
		});
		expect(retired).toEqual(["ws_f", "ws_p"]);
		expect(paused).toEqual([TEARDOWN_SPACING_MS, TEARDOWN_SPACING_MS]);
		expect(queued).toEqual([]);
		expect(run.stranded).toEqual({
			found: 2,
			retired: 2,
			skippedChanged: 0,
			deferred: 0,
			failed: 0,
		});
	});

	test("a failed or stranded row that changed or could not be retired is counted, and the next run tries again", async () => {
		const { deps } = fakeDeps({
			findStranded: async () => [
				strandedRow("ws_f", "ws-failed", "failed"),
				strandedRow("ws_p", "ws-stranded", "provisioning"),
			],
			retireStrandedWorkspace: async (row) => {
				if (row.status === "failed") return false;
				throw new Error("db down");
			},
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: true,
			deps,
		});
		expect(run.stranded).toMatchObject({
			retired: 0,
			skippedChanged: 1,
			failed: 1,
		});
	});

	test("deletes an archived box still there past its grace through the archive's own delete, by the guard that fits the row", async () => {
		let cutoff: Date | undefined;
		let askedAbout: string[] = [];
		const archivedAt = new Date("2026-10-01T00:00:00.000Z");
		const { deps, reaped } = fakeDeps({
			listAllSandboxes: async () => [box("ws-dated"), box("ws-undated")],
			countArchivedPastGrace: async (at) => {
				cutoff = at;
				return 40;
			},
			findArchivedPastGraceAmong: async (_at, names) => {
				askedAbout = names;
				return [
					{ id: "ws_d", providerSandboxId: "ws-dated", deletedAt: archivedAt },
					{ id: "ws_u", providerSandboxId: "ws-undated", deletedAt: null },
				];
			},
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: true,
			deps,
		});
		expect(cutoff?.getTime()).toBe(NOW - ARCHIVED_BACKSTOP_AFTER_MS);
		expect(askedAbout).toEqual(["ws-dated", "ws-undated"]);
		expect(reaped).toEqual([
			{
				cloudWorkspaceId: "ws_d",
				archivedAt: archivedAt.toISOString(),
				stage: "delete",
			},
			{ cloudWorkspaceId: "ws_u", archivedBefore: cutoff },
		]);
		expect(run.archived).toEqual({
			found: 40,
			alreadyDeleted: 38,
			deleted: 2,
			skipped: 0,
			deferred: 0,
			failed: 0,
		});
	});

	test("an archived row unarchived or changed before its delete is counted as skipped", async () => {
		const { deps } = fakeDeps({
			listAllSandboxes: async () => [box("ws-dated")],
			countArchivedPastGrace: async () => 1,
			findArchivedPastGraceAmong: async () => [
				{ id: "ws_d", providerSandboxId: "ws-dated", deletedAt: new Date(0) },
			],
			reapArchived: async () => "skipped",
		});
		const run = await reapCloudWorkspaceRetention({
			now: NOW,
			production: true,
			deps,
		});
		expect(run.archived).toMatchObject({ deleted: 0, skipped: 1 });
	});

	test("queues at most a batch of orphans a run and counts the rest", async () => {
		const many = Array.from({ length: ORPHAN_BATCH + 3 }, (_, i) =>
			box(`ws-orphan${i}`),
		);
		const { deps, queued } = fakeDeps({
			listAllSandboxes: async () => many,
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
	let retiring: Parameters<typeof teardown.retireAndTearDown> | undefined;
	let retires = true;
	let failed: Parameters<typeof transition.failCloudWorkspace>[0] | undefined;
	stub(teardown, {
		retireAndTearDown: async (
			...args: Parameters<typeof teardown.retireAndTearDown>
		) => {
			retiring = args;
			return retires;
		},
	});
	stub(transition, {
		failCloudWorkspace: async (
			args: Parameters<typeof transition.failCloudWorkspace>[0],
		) => {
			failed = args;
			return true;
		},
	});

	test("retires the box name while the row is asleep and idle, then fails the row as an expired snapshot", async () => {
		const cutoff = new Date(NOW - RETENTION_IDLE_MS);
		retires = false;
		expect(await retireIdleWorkspace(idleRow(1), cutoff)).toBe(false);
		expect(failed).toBeUndefined();
		retires = true;
		expect(await retireIdleWorkspace(idleRow(1), cutoff)).toBe(true);
		expect(retiring?.[0]).toEqual({
			id: "ws_1",
			providerSandboxId: "ws-box1",
			driveName: null,
		});
		expect(retiring?.[1]).toBeDefined();
		expect(failed).toMatchObject({
			scope: { cloudWorkspaceId: "ws_1", organizationId: "org_1" },
			from: ["asleep"],
			reason: "snapshot_expired",
			expected: true,
			set: { sandboxUrl: null },
		});
	});

	test("a stranded provisioning row gives up its box and fails; a failed row only gives up its box", async () => {
		const cutoffs = {
			failed: new Date(NOW - RETENTION_IDLE_MS),
			provisioning: new Date(NOW - STRANDED_PROVISIONING_MS),
		};
		retires = true;
		failed = undefined;
		expect(
			await retireStrandedWorkspace(
				strandedRow("ws_f", "ws-failed", "failed"),
				cutoffs,
			),
		).toBe(true);
		expect(retiring?.[0]).toEqual({
			id: "ws_f",
			providerSandboxId: "ws-failed",
			driveName: null,
		});
		expect(failed).toBeUndefined();
		expect(
			await retireStrandedWorkspace(
				strandedRow("ws_p", "ws-stranded", "provisioning"),
				cutoffs,
			),
		).toBe(true);
		expect(failed).toMatchObject({
			scope: { cloudWorkspaceId: "ws_p" },
			from: ["provisioning"],
			reason: "create_failed",
			expected: true,
		});
	});
});

describe("findStranded", () => {
	let queries = 0;
	const chain = {
		from: () => chain,
		where: () => chain,
		orderBy: () => chain,
		limit: async () => {
			queries++;
			return [];
		},
	};
	stub(db, { select: () => chain });

	test("looks for failed rows only among listed boxes, so a retired name leaves the selection", async () => {
		const args = {
			failedCutoff: new Date(NOW - RETENTION_IDLE_MS),
			provisioningCutoff: new Date(NOW - STRANDED_PROVISIONING_MS),
			limit: STRANDED_BATCH,
		};
		await findStranded({ ...args, names: [] });
		expect(queries).toBe(1);
		await findStranded({ ...args, names: ["ws-a"] });
		expect(queries).toBe(3);
	});
});
