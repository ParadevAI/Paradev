import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import type { ListedSandbox } from "../../lib/sandbox";
import * as meter from "./meter";
import * as reap from "./reap";
import {
	LEFTOVER_AGE_MS,
	type RetentionDeps,
	RUN_BUDGET_MS,
	reapCloudWorkspaceRetention,
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

const NOW = Date.parse("2026-11-23T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const CURRENT = { sha: "c".repeat(64), releasedAt: new Date(NOW - DAY) };
const PREVIOUS = { sha: "b".repeat(64), releasedAt: new Date(NOW - 5 * DAY) };
const agentsDrive = (release: { sha: string }, region = "sfo1") =>
	`agent-tools-${region}-${release.sha.slice(0, 12)}`;

const row = (n: number, status: WaitStatus = "asleep"): WaitingWorkspace => ({
	id: `ws_${n}`,
	organizationId: "org_1",
	providerSandboxId: `ws-box${n}`,
	status,
});
const box = (name: string, more: Partial<ListedSandbox> = {}) => ({
	name,
	createdAt: NOW - 60 * DAY,
	...more,
});
const drive = (name: string, createdAt = NOW - 60 * DAY) => ({
	name,
	createdAt,
});
const render = (where: Parameters<PgDialect["sqlToQuery"]>[0]) =>
	new PgDialect().sqlToQuery(where);

/** Every listed box is named by a row unless it is in `unnamed`. */
function fakeDeps(more: Partial<RetentionDeps> = {}, unnamed: string[] = []) {
	const done: string[] = [];
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
		namedSandboxes: async (names) =>
			new Set(names.filter((name) => !unnamed.includes(name))),
		recentReleases: async () => [CURRENT, PREVIOUS],
		teardownBox: async (name) => {
			done.push(name);
			return true;
		},
		deleteDrive: async (name) => {
			done.push(name);
		},
		log: (line) => {
			lines.push(line);
		},
		...more,
	};
	const decisions = () =>
		lines
			.filter((line) => line.startsWith("[cleanup] {"))
			.map((line) => JSON.parse(line.slice(10)));
	return { deps, done, decisions };
}
const run = (deps: RetentionDeps, clock?: () => number) =>
	reapCloudWorkspaceRetention({ now: NOW, deps, clock });
const counts = async (deps: RetentionDeps) => {
	const result = await run(deps);
	if (!("counts" in result)) throw new Error(JSON.stringify(result));
	return result.counts;
};

const reported: unknown[] = [];
stub(Sentry, {
	captureException: (error: unknown) => {
		reported.push(error);
		return "";
	},
	captureMessage: () => "",
});

describe("the cleanup job", () => {
	test("runs only in production", async () => {
		const { deps, done } = fakeDeps({ findPastWait: async () => [row(1)] });
		process.env.VERCEL_ENV = "preview";
		try {
			expect(await run(deps)).toEqual({ skipped: "not production" });
		} finally {
			process.env.VERCEL_ENV = "production";
		}
		expect(done).toEqual([]);
	});

	test("fails closed: a listing that fails, is empty, or lacks a box running now deletes nothing", async () => {
		const listings = [
			async () => {
				throw new Error("page 3 answered 500");
			},
			async () => [],
			async () => [box("ws-other")],
		];
		for (const listSandboxes of listings) {
			const { deps, done } = fakeDeps(
				{
					boxesRunningNow: async () => ["ws-running"],
					listSandboxes,
					findPastWait: async () => [row(1)],
				},
				["ws-other"],
			);
			expect(await run(deps)).toMatchObject({ skipped: "listing incomplete" });
			expect(done).toEqual([]);
		}
	});

	test("rule 1: retires each row one select finds past its wait, and logs why", async () => {
		let listed: readonly string[] = [];
		const { deps, done, decisions } = fakeDeps({
			listSandboxes: async () => [box("ws-box2")],
			findPastWait: async (_now, names) => {
				listed = names;
				return [row(1, "asleep"), row(2, "archived")];
			},
		});
		expect((await counts(deps))["rule1 workspaces"]).toEqual({
			kept: 0,
			deleted: 2,
		});
		expect(listed).toEqual(["ws-box2"]);
		expect(done).toEqual(["ws_1", "ws_2"]);
		expect(decisions().map((d) => d.reason)).toEqual([
			"asleep for more than 30 days",
			"archived for more than 7 days",
		]);
	});

	test("rule 1: a wake that lands first wins, and the row keeps its box", async () => {
		const { deps } = fakeDeps({
			findPastWait: async () => [row(1)],
			retireWorkspace: async () => false,
		});
		expect((await counts(deps))["rule1 workspaces"]).toEqual({
			kept: 1,
			deleted: 0,
		});
	});

	test("deletes 4 at a time, stops starting work when its time is up, and leaves the rest for the next run", async () => {
		let time = 0;
		let inFlight = 0;
		let most = 0;
		const { deps, done } = fakeDeps({
			findPastWait: async () => Array.from({ length: 6 }, (_, i) => row(i)),
			retireWorkspace: async (row) => {
				most = Math.max(most, ++inFlight);
				await Promise.resolve();
				inFlight--;
				done.push(row.id);
				time += RUN_BUDGET_MS;
				return true;
			},
		});
		await run(deps, () => time);
		expect(most).toBe(4);
		expect(done).toHaveLength(4);
	});

	test("a delete that fails is reported and the rest go on; the next run retries it", async () => {
		reported.length = 0;
		const { deps, done } = fakeDeps(
			{
				listSandboxes: async () => [box("ws-a"), box("ws-b")],
				teardownBox: async (name) => {
					if (name === "ws-a") throw new Error("vercel down");
					done.push(name);
					return true;
				},
			},
			["ws-a", "ws-b"],
		);
		await run(deps);
		expect(done).toEqual(["ws-b"]);
		expect(reported).toHaveLength(1);
	});

	test("rule 3: a box no live row names goes once it is 7 days old, an archived environment's golden included", async () => {
		const young = NOW - LEFTOVER_AGE_MS + DAY;
		const { deps, done } = fakeDeps(
			{
				listSandboxes: async () => [
					box("ws-named"),
					box("ws-orphan"),
					box("env-of-archived-environment"),
					box("ws-young", { createdAt: young }),
				],
			},
			["ws-orphan", "env-of-archived-environment", "ws-young"],
		);
		expect((await counts(deps))["rule3 boxes"]).toEqual({
			kept: 2,
			deleted: 2,
		});
		expect(done).toEqual(["ws-orphan", "env-of-archived-environment"]);
	});

	test("rule 3: a box rule 1 just retired is not torn down again", async () => {
		const { deps, done } = fakeDeps(
			{
				listSandboxes: async () => [box("ws-box1")],
				findPastWait: async () => [row(1)],
			},
			["ws-box1"],
		);
		await run(deps);
		expect(done).toEqual(["ws_1"]);
	});

	test("rule 3: a drive goes once it is 7 days old", async () => {
		const { deps, done } = fakeDeps({
			listDrives: async () => [
				drive("drive-old"),
				drive("drive-young", NOW - DAY),
			],
		});
		expect((await counts(deps))["rule3 drives"]).toEqual({
			kept: 1,
			deleted: 1,
		});
		expect(done).toEqual(["drive-old"]);
	});

	const agentsKeeps = async (
		name: string,
		more: Partial<RetentionDeps> = {},
		createdAt?: number,
	) => {
		const { deps, done, decisions } = fakeDeps({
			listDrives: async () => [drive(name, createdAt)],
			...more,
		});
		await run(deps);
		expect(done).toEqual([]);
		return decisions().find((d) => d.name === name)?.reason;
	};

	test("agents drive: the current release's is kept", async () => {
		expect(await agentsKeeps(agentsDrive(CURRENT))).toBe(
			"the current release's",
		);
	});

	test("agents drive: the previous release's is kept while the current one is under 48 h old", async () => {
		expect(await agentsKeeps(agentsDrive(PREVIOUS))).toBe(
			"the previous release's, kept 48 h after the current one",
		);
	});

	test("agents drive: one under 48 h old is kept", async () => {
		expect(
			await agentsKeeps("agent-tools-sfo1-aaaaaaaaaaaa", {}, NOW - 1.5 * DAY),
		).toBe("made less than 48 h ago");
	});

	test("agents drive: with no release recorded, none is deleted", async () => {
		expect(
			await agentsKeeps("agent-tools-sfo1-aaaaaaaaaaaa", {
				recentReleases: async () => [],
			}),
		).toBe("no current release recorded");
	});

	test("agents drive: an older release's goes, and the previous release's once the current one is 48 h old", async () => {
		const { deps, done } = fakeDeps({
			recentReleases: async () => [
				{ ...CURRENT, releasedAt: new Date(NOW - 3 * DAY) },
				PREVIOUS,
			],
			listDrives: async () => [
				drive(agentsDrive(CURRENT)),
				drive(agentsDrive(PREVIOUS)),
				drive("agent-tools-sfo1-aaaaaaaaaaaa"),
			],
		});
		expect((await counts(deps))["rule3 drives"]).toEqual({
			kept: 1,
			deleted: 2,
		});
		expect(done).toEqual([
			agentsDrive(PREVIOUS),
			"agent-tools-sfo1-aaaaaaaaaaaa",
		]);
	});

	test("agents drive: one a running box holds is refused by Vercel, reported, and the rest go on", async () => {
		reported.length = 0;
		const { deps, done } = fakeDeps({
			listDrives: async () => [
				drive("agent-tools-sfo1-aaaaaaaaaaaa"),
				drive("agent-tools-iad1-aaaaaaaaaaaa"),
			],
			deleteDrive: async (name) => {
				if (name.includes("sfo1")) throw new Error("drive is attached");
				done.push(name);
			},
		});
		expect((await counts(deps))["rule3 drives"]).toEqual({
			kept: 0,
			deleted: 1,
		});
		expect(done).toEqual(["agent-tools-iad1-aaaaaaaaaaaa"]);
		expect(reported).toHaveLength(1);
	});
});

describe("retireWorkspace", () => {
	let written: { set: Record<string, unknown>; where: unknown } | undefined;
	let steps: string[] = [];
	const step = (name: string) => async () => {
		steps.push(name);
	};
	stub(db, {
		update: () => ({
			set: (set: Record<string, unknown>) => ({
				where: (where: unknown) => ({
					returning: async () => {
						written = { set, where };
						steps.push("retire");
						return [{ id: "ws_1" }];
					},
				}),
			}),
		}),
	});
	stub(teardown, {
		teardownBox: async (name: string) => {
			steps.push(`delete ${name}`);
			return true;
		},
	});
	stub(sandboxSleep, { recordBootEnd: step("end boots") });
	stub(meter, { settleWorkspaceNow: step("settle") });
	stub(reap, { reapWorkspaceFiles: step("files") });

	async function retireAs(status: WaitStatus) {
		steps = [];
		expect(await retireWorkspace(row(1, status), NOW)).toBe(true);
		const condition = render(
			written?.where as Parameters<PgDialect["sqlToQuery"]>[0],
		);
		expect(condition.params).toEqual(
			expect.arrayContaining([
				"ws_1",
				"ws-box1",
				status,
				new Date(NOW - WAIT[status].ms).toISOString(),
			]),
		);
		expect(written?.set.providerSandboxId).toMatch(/^ws-ws_1[0-9a-f]{8}$/);
		expect(steps.at(-1)).toBe("delete ws-box1");
		return { sql: condition.sql, set: written?.set };
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

	test("archived: 7 days after the archive, it ends its boots and settles, then retires, drops its files and deletes the box", async () => {
		const { sql, set } = await retireAs("archived");
		expect(sql).toContain('"deleted_at"');
		expect(set).not.toHaveProperty("status");
		expect(steps).toEqual([
			"end boots",
			"settle",
			"retire",
			"files",
			"delete ws-box1",
		]);
	});

	test("failed: 30 days after it failed, it is retired and stays failed", async () => {
		const { sql, set } = await retireAs("failed");
		expect(sql).toContain('"failed_at"');
		expect(set).not.toHaveProperty("status");
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
	const query = render(waitOverWhere(NOW, ["ws-a"]));
	expect(query.params).toEqual(
		expect.arrayContaining([
			"asleep",
			"archived",
			"failed",
			"provisioning",
			["ws-a"],
		]),
	);
	expect(query.sql.match(/= any\(/g)).toHaveLength(2);
});
