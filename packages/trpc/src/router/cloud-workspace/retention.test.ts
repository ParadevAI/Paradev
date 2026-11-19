import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import type { ListedDrive, ListedSandbox } from "../../lib/sandbox";
import * as meter from "./meter";
import * as reap from "./reap";
import {
	type EnvironmentGoldens,
	LEFTOVER_AGE_MS,
	RETIRE_BATCH,
	type RetentionDeps,
	RUN_BUDGET_MS,
	reapCloudWorkspaceRetention,
	retireWorkspace,
	TEARDOWN_SPACING_MS,
	WAIT_MS,
	type WaitingWorkspace,
	type WaitStatus,
	waitOverWhere,
} from "./retention";
import * as sandboxSleep from "./sandbox-sleep";
import * as teardown from "./teardown";

const NOW = Date.parse("2026-11-19T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const BUNDLE = "0123456789abcdef".repeat(4);

const row = (n: number, status: WaitStatus = "asleep"): WaitingWorkspace => ({
	id: `ws_${n}`,
	organizationId: "org_1",
	providerSandboxId: `ws-box${n}`,
	status,
});

const box = (
	name: string,
	overrides: Partial<ListedSandbox> = {},
): ListedSandbox => ({
	name,
	kind: "workspace",
	createdAt: NOW - 60 * DAY,
	status: "stopped",
	mounts: [],
	...overrides,
});

const drive = (
	name: string,
	overrides: Partial<ListedDrive> = {},
): ListedDrive => ({
	name,
	createdAt: NOW - 60 * DAY,
	attachedTo: undefined,
	...overrides,
});

const render = (where: Parameters<PgDialect["sqlToQuery"]>[0]) =>
	new PgDialect().sqlToQuery(where);

function fakeDeps(overrides: Partial<RetentionDeps> = {}) {
	const tornDown: string[] = [];
	const deletedDrives: string[] = [];
	const retired: string[] = [];
	const paused: number[] = [];
	const lines: string[] = [];
	const deps: RetentionDeps = {
		boxesRunningNow: async () => [],
		listSandboxes: async () => [box("ws-live")],
		listDrives: async () => [],
		findPastWait: async () => [],
		retireWorkspace: async (row) => {
			retired.push(row.id);
			return true;
		},
		listEnvironmentGoldens: async () => [],
		namedByLiveRow: async () => new Set(),
		namedByAnyRow: async (names) => new Set(names),
		namedDrives: async () => new Set(),
		currentBundleSha: async () => BUNDLE,
		tearDownBox: async (name) => {
			tornDown.push(name);
		},
		deleteDrive: async (name) => {
			deletedDrives.push(name);
		},
		pause: async (ms) => {
			paused.push(ms);
		},
		log: (line) => lines.push(line),
		...overrides,
	};
	const decisions = () =>
		lines
			.filter((line) => line.startsWith("[cleanup] {"))
			.map((line) => JSON.parse(line.slice("[cleanup] ".length)));
	return { deps, tornDown, deletedDrives, retired, paused, decisions };
}

const run = (deps: RetentionDeps, clock?: () => number) =>
	reapCloudWorkspaceRetention({ now: NOW, production: true, deps, clock });

describe("the cleanup job", () => {
	test("runs only in production", async () => {
		let listed = false;
		const { deps } = fakeDeps({
			listSandboxes: async () => {
				listed = true;
				return [];
			},
		});
		expect(
			await reapCloudWorkspaceRetention({ now: NOW, production: false, deps }),
		).toEqual({ skipped: "not production" });
		expect(listed).toBe(false);
	});

	test("fails closed: an incomplete listing deletes nothing", async () => {
		let expected: readonly string[] = [];
		const { deps, retired, tornDown, deletedDrives } = fakeDeps({
			boxesRunningNow: async () => ["ws-running"],
			listSandboxes: async (names) => {
				expected = names;
				throw new Error("listing lacks ws-running");
			},
			findPastWait: async () => [row(1)],
		});
		expect(await run(deps)).toMatchObject({ skipped: "listing incomplete" });
		expect(expected).toEqual(["ws-running"]);
		expect(retired).toEqual([]);
		expect(tornDown).toEqual([]);
		expect(deletedDrives).toEqual([]);
	});

	test("rule 1: retires every row one select finds past its wait, a pause apart, and logs each", async () => {
		let asked: Parameters<RetentionDeps["findPastWait"]>[0] | undefined;
		const { deps, retired, paused, tornDown, decisions } = fakeDeps({
			listSandboxes: async () => [box("ws-box2"), box("ws-box3")],
			namedByAnyRow: async () => new Set(),
			findPastWait: async (args) => {
				asked = args;
				return [row(1, "asleep"), row(2, "archived"), row(3, "failed")];
			},
		});
		const result = await run(deps);
		expect(asked).toEqual({
			now: NOW,
			listedNames: ["ws-box2", "ws-box3"],
			limit: RETIRE_BATCH,
		});
		expect(retired).toEqual(["ws_1", "ws_2", "ws_3"]);
		expect(paused.slice(0, 3)).toEqual([
			TEARDOWN_SPACING_MS,
			TEARDOWN_SPACING_MS,
			TEARDOWN_SPACING_MS,
		]);
		expect(tornDown).toEqual([]);
		expect(decisions().filter((d) => d.rule === 1)).toEqual([
			expect.objectContaining({
				action: "delete",
				reason: "asleep for more than 30 days",
			}),
			expect.objectContaining({
				action: "delete",
				reason: "archived for more than 7 days",
			}),
			expect.objectContaining({
				action: "delete",
				reason: "failed for more than 30 days",
			}),
		]);
		expect(result).toMatchObject({
			rule1: {
				retired: { asleep: 1, archived: 1, failed: 1, provisioning: 0 },
			},
		});
	});

	test("rule 1: an asleep row whose box runs now is kept", async () => {
		const { deps, retired } = fakeDeps({
			listSandboxes: async () => [box("ws-box1", { status: "running" })],
			findPastWait: async () => [row(1)],
		});
		expect(await run(deps)).toMatchObject({ rule1: { skippedRunning: 1 } });
		expect(retired).toEqual([]);
	});

	test("rule 1: a wake that lands first wins, and the row keeps its box", async () => {
		const { deps, decisions } = fakeDeps({
			findPastWait: async () => [row(1)],
			retireWorkspace: async () => false,
		});
		expect(await run(deps)).toMatchObject({ rule1: { skippedChanged: 1 } });
		expect(decisions()).toContainEqual(
			expect.objectContaining({ rule: 1, action: "keep" }),
		);
	});

	test("stops starting work when its time is up and leaves the rest for the next run", async () => {
		let time = 0;
		const { deps, retired } = fakeDeps({
			findPastWait: async () => [row(1), row(2), row(3)],
			retireWorkspace: async (row) => {
				retired.push(row.id);
				time += RUN_BUDGET_MS + 1;
				return true;
			},
		});
		expect(await run(deps, () => time)).toMatchObject({
			rule1: { deferred: 2 },
		});
		expect(retired).toEqual(["ws_1"]);
	});

	test("rule 2: an archived environment's golden goes; a live one keeps its active golden and newest others", async () => {
		const envs: EnvironmentGoldens[] = [
			{ id: "env_a", archived: true, activeRef: "env-a", goldens: ["env-a"] },
			{
				id: "env_l",
				archived: false,
				activeRef: "env-l3",
				goldens: ["env-l5", "env-l4", "env-l3", "env-l2", "env-l1"],
			},
		];
		const { deps, tornDown } = fakeDeps({
			listSandboxes: async () =>
				["env-a", "env-l5", "env-l4", "env-l3", "env-l2", "env-l1"].map(
					(name) => box(name, { kind: "environment" }),
				),
			listEnvironmentGoldens: async () => envs,
		});
		const result = await run(deps);
		expect(tornDown).toEqual(["env-a", "env-l2", "env-l1"]);
		expect(result).toMatchObject({ rule2: { deleted: 3, kept: 3 } });
	});

	test("rule 2: a golden already gone from the listing is not deleted again, and one a live row names is kept", async () => {
		const { deps, tornDown } = fakeDeps({
			listSandboxes: async () => [box("env-shared")],
			listEnvironmentGoldens: async () => [
				{
					id: "e1",
					archived: true,
					activeRef: "env-gone",
					goldens: ["env-gone"],
				},
				{
					id: "e2",
					archived: true,
					activeRef: "env-shared",
					goldens: ["env-shared"],
				},
			],
			namedByLiveRow: async () => new Set(["env-shared"]),
		});
		await run(deps);
		expect(tornDown).toEqual([]);
	});

	test("rule 3: a box no production row names goes once it is 7 days old", async () => {
		const { deps, tornDown, decisions } = fakeDeps({
			listSandboxes: async () => [
				box("ws-named"),
				box("ws-orphan", { kind: undefined, status: "running" }),
				box("ws-young", { createdAt: NOW - LEFTOVER_AGE_MS + DAY }),
			],
			namedByAnyRow: async () => new Set(["ws-named"]),
		});
		const result = await run(deps);
		expect(tornDown).toEqual(["ws-orphan"]);
		expect(decisions()).toContainEqual(
			expect.objectContaining({
				rule: 3,
				name: "ws-young",
				action: "keep",
				reason: "made less than 7 days ago",
			}),
		);
		expect(result).toMatchObject({ rule3: { boxes: { deleted: 1, kept: 2 } } });
	});

	test("rule 3: a drive goes once no row names it, no box mounts it and it is 7 days old", async () => {
		const { deps, deletedDrives } = fakeDeps({
			listSandboxes: async () => [
				box("ws-stopped", { mounts: ["drive-mounted"] }),
			],
			listDrives: async () => [
				drive("drive-orphan"),
				drive("drive-mounted"),
				drive("drive-named"),
				drive("drive-attached", { attachedTo: "ws-other" }),
				drive("drive-young", { createdAt: NOW - DAY }),
			],
			namedDrives: async () => new Set(["drive-named"]),
		});
		const result = await run(deps);
		expect(deletedDrives).toEqual(["drive-orphan"]);
		expect(result).toMatchObject({
			rule3: { drives: { deleted: 1, kept: 4 } },
		});
	});

	test("rule 3: an agents drive goes once it is not the current release's and no box, stopped ones included, mounts it", async () => {
		const old = "aaaaaaaaaaaa";
		const { deps, deletedDrives } = fakeDeps({
			listSandboxes: async () => [
				box("ws-stopped", { mounts: [`agent-tools-iad1-${old}`] }),
			],
			listDrives: async () => [
				drive(`agent-tools-sfo1-${BUNDLE.slice(0, 12)}`),
				drive(`agent-tools-sfo1-${old}`),
				drive(`agent-tools-iad1-${old}`),
				drive("agent-tools-sfo1-bbbbbbbbbbbb", { createdAt: NOW - DAY / 2 }),
			],
		});
		const result = await run(deps);
		expect(deletedDrives).toEqual([`agent-tools-sfo1-${old}`]);
		expect(result).toMatchObject({
			rule3: { agentsDrives: { deleted: 1, kept: 3 } },
		});
	});

	test("rule 3: no current release recorded keeps every agents drive", async () => {
		const { deps, deletedDrives } = fakeDeps({
			listDrives: async () => [drive("agent-tools-sfo1-aaaaaaaaaaaa")],
			currentBundleSha: async () => null,
		});
		await run(deps);
		expect(deletedDrives).toEqual([]);
	});
});

describe("retireWorkspace", () => {
	let retiring: Parameters<typeof teardown.retireAndTearDown> | undefined;
	let steps: string[] = [];
	stub(teardown, {
		retireAndTearDown: async (
			...args: Parameters<typeof teardown.retireAndTearDown>
		) => {
			retiring = args;
			steps.push("retire");
			return true;
		},
	});
	stub(sandboxSleep, {
		recordBootEnd: async () => {
			steps.push("end boots");
		},
	});
	stub(meter, {
		settleWorkspaceNow: async () => {
			steps.push("settle");
		},
	});
	stub(reap, {
		reapWorkspaceFiles: async () => {
			steps.push("files");
		},
	});

	async function retireAs(status: WaitStatus) {
		retiring = undefined;
		steps = [];
		expect(await retireWorkspace(row(1, status), NOW)).toBe(true);
		expect(retiring?.[0]).toEqual({
			id: "ws_1",
			providerSandboxId: "ws-box1",
			driveName: null,
		});
		return {
			condition: render(
				retiring?.[1] as Parameters<PgDialect["sqlToQuery"]>[0],
			),
			set: retiring?.[2],
		};
	}

	const cutoff = (status: WaitStatus) =>
		new Date(NOW - WAIT_MS[status]).toISOString();

	test("asleep: 30 days after last use, the one write retires it as an expired snapshot", async () => {
		const { condition, set } = await retireAs("asleep");
		expect(condition.params).toEqual(
			expect.arrayContaining(["asleep", cutoff("asleep")]),
		);
		expect(condition.sql).toContain('"sandbox_expires_at"');
		expect(set).toMatchObject({
			status: "failed",
			failureReason: "snapshot_expired",
			sandboxUrl: null,
		});
	});

	test("archived: 7 days after the archive, it ends its boots and settles, then retires and drops its files", async () => {
		const { condition, set } = await retireAs("archived");
		expect(condition.params).toEqual(
			expect.arrayContaining(["archived", cutoff("archived")]),
		);
		expect(condition.sql).toContain('"deleted_at"');
		expect(set).toEqual({});
		expect(steps).toEqual(["end boots", "settle", "retire", "files"]);
	});

	test("failed: 30 days after it failed, it is retired and stays failed", async () => {
		const { condition, set } = await retireAs("failed");
		expect(condition.params).toEqual(
			expect.arrayContaining(["failed", cutoff("failed")]),
		);
		expect(condition.sql).toContain('"failed_at"');
		expect(set).toEqual({});
	});

	test("stuck creating: a day with no boot, it is retired as a failed create", async () => {
		const { condition, set } = await retireAs("provisioning");
		expect(condition.params).toEqual(
			expect.arrayContaining(["provisioning", cutoff("provisioning")]),
		);
		expect(condition.sql).toContain('"started_at"');
		expect(set).toMatchObject({
			status: "failed",
			failureReason: "create_failed",
		});
	});
});

describe("waitOverWhere", () => {
	test("a retired row leaves the selection: by its new status, or, keeping its status, because its new name is not listed", () => {
		const listed = render(waitOverWhere({ now: NOW, listedNames: ["ws-a"] }));
		expect(listed.params).toEqual(
			expect.arrayContaining([
				"asleep",
				"archived",
				"failed",
				"provisioning",
				"ws-a",
			]),
		);
		expect(listed.sql.match(/string_to_array/g)).toHaveLength(2);
		const none = render(waitOverWhere({ now: NOW, listedNames: [] }));
		expect(none.sql).not.toContain("string_to_array");
		expect(none.sql.match(/false/g)).toHaveLength(2);
	});
});
