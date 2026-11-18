import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as jobs from "./jobs";
import * as meter from "./meter";
import {
	recordSandboxAwake,
	syncSandboxExpiries,
	watchSandboxExpiry,
} from "./sandbox-expiry";
import { recordSandboxAsleep } from "./sandbox-sleep";

const NOW = Date.now();
const MINUTE = 60_000;
const dialect = new PgDialect();

let storedExpiry: Date | null;
let storedStatus: string;
let storedSession: string | null;
let describedSessionId: string | null | undefined;
let onDescribe: () => void;
let liveExpiry: Date | null;
let calls: string[];
let watches: { delaySeconds?: number; deduplicationId?: string }[];
let writeError: Error | null;
let writes: {
	set: Record<string, unknown>;
	where: string;
	params: unknown[];
}[];

stub(db.query.cloudWorkspaces, {
	findFirst: async () => ({
		organizationId: "org_1",
		providerSandboxId: "ws-box",
		sandboxExpiresAt: storedExpiry,
		sandboxSessionId: storedSession,
	}),
});
stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => ({
			where: (where: SQL) => {
				const rendered = dialect.sqlToQuery(where);
				writes.push({
					set: values,
					where: rendered.sql,
					params: rendered.params,
				});
				return Object.assign(Promise.resolve(), {
					returning: async () => {
						if (writeError) throw writeError;
						const guard = rendered.sql.match(/"sandbox_session_id" = \$(\d+)/);
						const guarded = guard
							? rendered.params[Number(guard[1]) - 1]
							: null;
						if (guard && storedSession !== null && guarded !== storedSession) {
							return [];
						}
						storedStatus = (values.status as string) ?? storedStatus;
						if (typeof values.sandboxSessionId === "string") {
							storedSession = values.sandboxSessionId;
						}
						if (values.sandboxExpiresAt instanceof Date) {
							storedExpiry = values.sandboxExpiresAt;
						}
						return [{ organizationId: "org_1" }];
					},
				});
			},
		}),
	}),
	select: () => ({
		from: () => ({
			where: async () => [{ id: "ws_1", providerSandboxId: "ws-box" }],
		}),
	}),
});
stub(sandbox, {
	describeSandbox: async () => {
		calls.push("describe");
		onDescribe();
		return {
			hostTarget: "https://box",
			running: !!liveExpiry,
			expiresAt: liveExpiry,
			sessionId:
				describedSessionId !== undefined
					? describedSessionId
					: liveExpiry
						? "session_2"
						: "session_1",
		};
	},
});
stub(realtime, { nudge: () => calls.push("nudge") });
stub(meter, {
	queueSettleWorkspace: async () => {
		calls.push("settle");
	},
});
stub(jobs, {
	publishCloudWorkspaceJob: async (job: (typeof watches)[number]) => {
		watches.push(job);
	},
});

beforeEach(() => {
	calls = [];
	watches = [];
	writes = [];
	liveExpiry = null;
	storedStatus = "awake";
	storedSession = "session_1";
	describedSessionId = undefined;
	onDescribe = () => {};
	writeError = null;
});

function expectAsleepGuardedBy(sessionId: string) {
	const [asleep] = writes;
	expect(asleep?.set.status).toBe("asleep");
	expect(asleep?.where).toContain('"sandbox_session_id" = $');
	expect(asleep?.params).toContain(sessionId);
}

describe("watchSandboxExpiry", () => {
	test("follows an extension without asking the provider", async () => {
		storedExpiry = new Date(NOW + 30 * MINUTE);
		expect(await watchSandboxExpiry({ cloudWorkspaceId: "ws_1" })).toBe(
			"rewatched",
		);
		expect(calls).toEqual([]);
		expect(watches).toHaveLength(1);
		expect(watches[0]?.deduplicationId).toBe(`ws_1-${storedExpiry.getTime()}`);
		expect(watches[0]?.deduplicationId).not.toContain(":");
	});

	test("a confirmed stop marks the row asleep, tells clients and settles the meter", async () => {
		storedExpiry = new Date(NOW - 5_000);
		expect(await watchSandboxExpiry({ cloudWorkspaceId: "ws_1" })).toBe(
			"asleep",
		);
		expect(storedStatus).toBe("asleep");
		expectAsleepGuardedBy("session_1");
		expect(calls).toEqual(["describe", "nudge", "settle"]);
		expect(watches).toEqual([]);
	});

	test("a box still running past its recorded expiry goes through recordSandboxAwake", async () => {
		storedExpiry = new Date(NOW - 5_000);
		liveExpiry = new Date(NOW + 20 * MINUTE);
		expect(await watchSandboxExpiry({ cloudWorkspaceId: "ws_1" })).toBe(
			"rewatched",
		);
		expect(storedExpiry).toEqual(liveExpiry);
		expect(storedStatus).toBe("awake");
		expect(writes[0]?.set.sandboxSessionId).toBe("session_2");
		expect(calls).toEqual(["describe", "nudge"]);
		expect(watches).toHaveLength(1);
	});

	test("a failed sleep write is reported, not thrown into the box operation it follows", async () => {
		writeError = new Error("db down");
		await expect(
			recordSandboxAwake("ws_1", {
				expiresAt: new Date(NOW + 60 * MINUTE),
				sessionId: "session_1",
			}),
		).resolves.toBeUndefined();
		expect(watches).toEqual([]);
	});
});

describe("a stale record never marks a running box asleep", () => {
	test("our stop writes asleep only while the row still records the session it stopped", async () => {
		await recordSandboxAsleep("ws_1", { sessionId: "session_1" });
		expectAsleepGuardedBy("session_1");
	});

	test("a wake between the watch's read and its write keeps the row awake when Vercel gives no session id", async () => {
		storedExpiry = new Date(NOW - 5_000);
		describedSessionId = null;
		onDescribe = () => {
			storedSession = "session_2";
			storedStatus = "awake";
		};
		await watchSandboxExpiry({ cloudWorkspaceId: "ws_1" });
		expect(storedStatus).toBe("awake");
		expect(storedSession).toBe("session_2");
	});

	test("the reconcile skips a stopped listing that carries no session id", async () => {
		await syncSandboxExpiries([
			{ name: "ws-box", expiresAt: null, sessionId: null },
		]);
		expect(writes).toEqual([]);
	});

	test("the reconcile writes asleep only while the row still records the listed session", async () => {
		await syncSandboxExpiries([
			{ name: "ws-box", expiresAt: null, sessionId: "session_listed" },
		]);
		expectAsleepGuardedBy("session_listed");
	});

	test("an awake report flips an asleep row only for a new session", async () => {
		await recordSandboxAwake("ws_1", {
			expiresAt: new Date(NOW + 60 * MINUTE),
			sessionId: "session_1",
		});
		const asleepBranch = writes[0]?.where.match(
			/"status" = \$(\d+) and "cloud_workspaces"\."sandbox_session_id" is distinct from \$(\d+)/,
		);
		expect(writes[0]?.params[Number(asleepBranch?.[1]) - 1]).toBe("asleep");
		expect(writes[0]?.params[Number(asleepBranch?.[2]) - 1]).toBe("session_1");
	});
});
