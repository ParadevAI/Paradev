import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import type { ListedDrive, ListedSandbox } from "../../lib/sandbox";
import * as meter from "./meter";
import * as reap from "./reap";
import {
	LEFTOVER_AGE_MS,
	MUTATING_DEPS,
	type RetentionDeps,
	RUN_BUDGET_MS,
	reapCloudWorkspaceRetention,
	TEARDOWN_SPACING_MS,
} from "./retention";
import * as sandboxSleep from "./sandbox-sleep";
import * as teardown from "./teardown";
import {
	retireWorkspace,
	WAIT,
	type WaitingWorkspace,
	type WaitStatus,
	waitOverWhere,
} from "./wait";

const NOW = Date.parse("2026-11-19T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const BUNDLE = "0123456789abcdef".repeat(4);

const row = (n: number, status: WaitStatus = "asleep"): WaitingWorkspace => ({
	id: `ws_${n}`,
	organizationId: "org_1",
	providerSandboxId: `ws-box${n}`,
	status,
	createdAt: new Date(NOW - 90 * DAY),
});
const box = (name: string, more: Partial<ListedSandbox> = {}) => ({
	name,
	createdAt: NOW - 60 * DAY,
	status: "stopped",
	mounts: [],
	...more,
});
const drive = (name: string, more: Partial<ListedDrive> = {}) => ({
	name,
	createdAt: NOW - 60 * DAY,
	attachedTo: undefined,
	...more,
});
const render = (where: Parameters<PgDialect["sqlToQuery"]>[0]) =>
	new PgDialect().sqlToQuery(where);

/** Every box listed is named by a row unless `unnamed` says otherwise. */
function fakeDeps(more: Partial<RetentionDeps> = {}, unnamed: string[] = []) {
	const done: string[] = [];
	const paused: number[] = [];
	const lines: string[] = [];
	const deps: RetentionDeps = {
		boxesRunningNow: async () => [],
		listSandboxes: async () => [box("ws-live")],
		listDrives: async () => [],
		findPastWait: async () => [],
		retireWorkspace: async (row) => {
			done.push(row.id);
			return true;
		},
		listEnvironmentGoldens: async () => [],
		namedSandboxes: async (names, opts) =>
			new Set(opts?.archived ? names.filter((n) => !unnamed.includes(n)) : []),
		namedDrives: async () => new Set(),
		currentBundleSha: async () => BUNDLE,
		tearDownBox: async (name) => void done.push(name),
		deleteDrive: async (name) => void done.push(name),
		pause: async (ms) => void paused.push(ms),
		log: (line) => void lines.push(line),
		...more,
	};
	const decisions = () =>
		lines
			.filter((line) => line.startsWith("[cleanup] {"))
			.map((line) => JSON.parse(line.slice(10)));
	return { deps, done, paused, decisions };
}
const run = (deps: RetentionDeps, clock?: () => number) =>
	reapCloudWorkspaceRetention({ now: NOW, production: true, deps, clock });
const countsOf = async (deps: RetentionDeps) => {
	const result = await run(deps);
	if (!("counts" in result)) throw new Error(JSON.stringify(result));
	return result.counts;
};

describe("the cleanup job", () => {
	test("runs only in production", async () => {
		const { deps, done } = fakeDeps({ findPastWait: async () => [row(1)] });
		expect(
			await reapCloudWorkspaceRetention({ now: NOW, production: false, deps }),
		).toEqual({ skipped: "not production" });
		expect(done).toEqual([]);
	});

	test("fails closed: an incomplete listing deletes nothing", async () => {
		let expected: readonly string[] = [];
		const { deps, done } = fakeDeps({
			boxesRunningNow: async () => ["ws-running"],
			listSandboxes: async (names) => {
				expected = names;
				throw new Error("listing lacks ws-running");
			},
			findPastWait: async () => [row(1)],
		});
		expect(await run(deps)).toMatchObject({ skipped: "listing incomplete" });
		expect(expected).toEqual(["ws-running"]);
		expect(done).toEqual([]);
	});

	test("a dry run reads everything, reaches no write or delete, and logs what it would delete", async () => {
		const reached = () => {
			throw new Error("a dry run reached a write or a delete");
		};
		const { deps, decisions } = fakeDeps(
			{
				listSandboxes: async () => [box("ws-orphan"), box("env-old")],
				findPastWait: async () => [row(1)],
				listDrives: async () => [drive("drive-orphan")],
				listEnvironmentGoldens: async () => [
					{
						id: "e",
						archived: true,
						activeRef: "env-old",
						goldens: ["env-old"],
					},
				],
			},
			["ws-orphan"],
		);
		const trapped = {
			...deps,
			...Object.fromEntries(MUTATING_DEPS.map((key) => [key, reached])),
		} as RetentionDeps;
		const result = await reapCloudWorkspaceRetention({
			now: NOW,
			production: true,
			deps: trapped,
			dryRun: true,
		});
		expect(result).toMatchObject({
			counts: {
				"rule1 workspace asleep": { deleted: 1, failed: 0 },
				"rule2 golden": { deleted: 1, failed: 0 },
				"rule3 box": { deleted: 1, failed: 0 },
				"rule3 drive": { deleted: 1, failed: 0 },
			},
		});
		const actions = new Set(decisions().map((d) => d.action));
		expect([actions.has("delete"), actions.has("would delete")]).toEqual([
			false,
			true,
		]);
	});

	test("rule 1: retires each row one select finds past its wait, a pause apart, and logs each", async () => {
		let listed: readonly string[] = [];
		const { deps, done, paused, decisions } = fakeDeps({
			listSandboxes: async () => [box("ws-box2")],
			findPastWait: async (_now, names) => {
				listed = names;
				return [row(1, "asleep"), row(2, "archived")];
			},
		});
		const counts = await countsOf(deps);
		expect(listed).toEqual(["ws-box2"]);
		expect(done).toEqual(["ws_1", "ws_2"]);
		expect(paused).toEqual([TEARDOWN_SPACING_MS, TEARDOWN_SPACING_MS]);
		expect(counts["rule1 workspace archived"]).toMatchObject({ deleted: 1 });
		expect(decisions().filter((d) => d.rule === 1)).toEqual([
			expect.objectContaining({ reason: "asleep for more than 30 days" }),
			expect.objectContaining({ reason: "archived for more than 7 days" }),
		]);
	});

	test("rule 1: an asleep row whose box runs now is kept", async () => {
		const { deps, done } = fakeDeps({
			listSandboxes: async () => [box("ws-box1", { status: "running" })],
			findPastWait: async () => [row(1)],
		});
		expect((await countsOf(deps))["rule1 workspace asleep"]).toMatchObject({
			kept: 1,
		});
		expect(done).toEqual([]);
	});

	test("rule 1: a wake that lands first wins, and the row keeps its box", async () => {
		const { deps } = fakeDeps({
			findPastWait: async () => [row(1)],
			retireWorkspace: async () => false,
		});
		expect((await countsOf(deps))["rule1 workspace asleep"]).toMatchObject({
			kept: 1,
			deleted: 0,
		});
	});

	test("stops starting work when its time is up and leaves the rest for the next run", async () => {
		let time = 0;
		const { deps } = fakeDeps({
			findPastWait: async () => [row(1), row(2), row(3)],
			retireWorkspace: async () => {
				time += RUN_BUDGET_MS + 1;
				return true;
			},
		});
		const result = await run(deps, () => time);
		expect(result).toMatchObject({
			counts: { "rule1 workspace asleep": { deleted: 1, deferred: 2 } },
		});
	});

	test("rule 2: an archived environment's golden goes; a live one keeps its active golden and newest others", async () => {
		const live = ["env-l5", "env-l4", "env-l3", "env-l2", "env-l1"];
		const { deps, done } = fakeDeps({
			listSandboxes: async () => ["env-a", ...live].map((name) => box(name)),
			listEnvironmentGoldens: async () => [
				{ id: "a", archived: true, activeRef: "env-a", goldens: ["env-a"] },
				{ id: "l", archived: false, activeRef: "env-l3", goldens: live },
			],
		});
		expect((await countsOf(deps))["rule2 golden"]).toMatchObject({
			deleted: 3,
			kept: 3,
		});
		expect(done).toEqual(["env-a", "env-l2", "env-l1"]);
	});

	test("rule 2: a golden already gone from the listing is left, and one a live row names is kept", async () => {
		const { deps, done } = fakeDeps({
			listSandboxes: async () => [box("env-shared")],
			listEnvironmentGoldens: async () => [
				{
					id: "1",
					archived: true,
					activeRef: "env-gone",
					goldens: ["env-gone"],
				},
				{
					id: "2",
					archived: true,
					activeRef: "env-shared",
					goldens: ["env-shared"],
				},
			],
			namedSandboxes: async (names, opts) =>
				new Set(opts?.archived ? names : ["env-shared"]),
		});
		await run(deps);
		expect(done).toEqual([]);
	});

	test("rule 3: a box no production row names goes once it is 7 days old", async () => {
		const young = NOW - LEFTOVER_AGE_MS + DAY;
		const { deps, done } = fakeDeps(
			{
				listSandboxes: async () => [
					box("ws-named"),
					box("ws-orphan", { status: "running" }),
					box("ws-young", { createdAt: young }),
				],
			},
			["ws-orphan", "ws-young"],
		);
		expect((await countsOf(deps))["rule3 box"]).toMatchObject({
			deleted: 1,
			kept: 2,
		});
		expect(done).toEqual(["ws-orphan"]);
	});

	test("rule 3: a drive goes once no row names it, no box mounts it and it is 7 days old", async () => {
		const { deps, done } = fakeDeps({
			listSandboxes: async () => [box("ws-stopped", { mounts: ["drive-m"] })],
			listDrives: async () => [
				drive("drive-orphan"),
				drive("drive-m"),
				drive("drive-named"),
				drive("drive-attached", { attachedTo: "ws-other" }),
				drive("drive-young", { createdAt: NOW - DAY }),
			],
			namedDrives: async () => new Set(["drive-named"]),
		});
		expect((await countsOf(deps))["rule3 drive"]).toMatchObject({
			deleted: 1,
			kept: 4,
		});
		expect(done).toEqual(["drive-orphan"]);
	});

	test("rule 3: an agents drive goes once it is not the current release's and no box, stopped ones included, mounts it", async () => {
		const old = "aaaaaaaaaaaa";
		const { deps, done } = fakeDeps({
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
		expect((await countsOf(deps))["rule3 agents drive"]).toMatchObject({
			deleted: 1,
			kept: 3,
		});
		expect(done).toEqual([`agent-tools-sfo1-${old}`]);
	});

	test("rule 3: no current release recorded keeps every agents drive", async () => {
		const { deps, done } = fakeDeps({
			listDrives: async () => [drive("agent-tools-sfo1-aaaaaaaaaaaa")],
			currentBundleSha: async () => null,
		});
		await run(deps);
		expect(done).toEqual([]);
	});
});

describe("retireWorkspace", () => {
	let retiring: Parameters<typeof teardown.retireAndTearDown> | undefined;
	let steps: string[] = [];
	const step = (name: string) => async () => void steps.push(name);
	stub(teardown, {
		retireAndTearDown: async (
			...args: Parameters<typeof teardown.retireAndTearDown>
		) => {
			retiring = args;
			steps.push("retire");
			return true;
		},
	});
	stub(sandboxSleep, { recordBootEnd: step("end boots") });
	stub(meter, { settleWorkspaceNow: step("settle") });
	stub(reap, { reapWorkspaceFiles: step("files") });

	async function retireAs(status: WaitStatus) {
		steps = [];
		expect(await retireWorkspace(row(1, status), NOW)).toBe(true);
		expect(retiring?.[0]).toEqual({
			id: "ws_1",
			providerSandboxId: "ws-box1",
			driveName: null,
		});
		const condition = render(
			retiring?.[1] as Parameters<PgDialect["sqlToQuery"]>[0],
		);
		expect(condition.params).toEqual(
			expect.arrayContaining([
				status,
				new Date(NOW - WAIT[status].ms).toISOString(),
			]),
		);
		return { sql: condition.sql, set: retiring?.[2] };
	}

	test("asleep: 30 days after last use, the one write retires it as an expired snapshot", async () => {
		const { sql, set } = await retireAs("asleep");
		expect(sql).toContain('"sandbox_expires_at"');
		expect(set).toMatchObject({
			status: "failed",
			failureReason: "snapshot_expired",
			sandboxUrl: null,
		});
	});

	test("archived: 7 days after the archive, it ends its boots and settles, then retires and drops its files", async () => {
		const { sql, set } = await retireAs("archived");
		expect(sql).toContain('"deleted_at"');
		expect(set).toEqual({});
		expect(steps).toEqual(["end boots", "settle", "retire", "files"]);
	});

	test("failed: 30 days after it failed, it is retired and stays failed", async () => {
		const { sql, set } = await retireAs("failed");
		expect(sql).toContain('"failed_at"');
		expect(set).toEqual({});
	});

	test("stuck creating: a day with no boot, it is retired as a failed create", async () => {
		const { sql, set } = await retireAs("provisioning");
		expect(sql).toContain('"started_at"');
		expect(set).toMatchObject({
			status: "failed",
			failureReason: "create_failed",
		});
	});
});

test("a retired row leaves rule 1's select: by its new status, or, keeping its status, because its new name is not listed", () => {
	const listed = render(waitOverWhere(NOW, ["ws-a"]));
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
	const none = render(waitOverWhere(NOW, []));
	expect(none.sql).not.toContain("string_to_array");
	expect(none.sql.match(/false/g)).toHaveLength(2);
});
