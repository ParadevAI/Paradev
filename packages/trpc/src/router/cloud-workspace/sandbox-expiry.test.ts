import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as jobs from "./jobs";
import * as meter from "./meter";
import { recordSandboxAwake, watchSandboxExpiry } from "./sandbox-expiry";

const NOW = Date.now();
const MINUTE = 60_000;

let storedExpiry: Date | null;
let storedStatus: string;
let liveExpiry: Date | null;
let calls: string[];
let watches: { delaySeconds?: number; deduplicationId?: string }[];
let writeError: Error | null;

stub(db.query.cloudWorkspaces, {
	findFirst: async () => ({
		organizationId: "org_1",
		providerSandboxId: "ws-box",
		sandboxExpiresAt: storedExpiry,
	}),
});
stub(db, {
	update: () => ({
		set: (values: { status?: string; sandboxExpiresAt?: unknown }) => ({
			where: () =>
				Object.assign(Promise.resolve(), {
					returning: async () => {
						if (writeError) throw writeError;
						storedStatus = values.status ?? storedStatus;
						if (values.sandboxExpiresAt instanceof Date) {
							storedExpiry = values.sandboxExpiresAt;
						}
						return [{ organizationId: "org_1" }];
					},
				}),
		}),
	}),
});
stub(sandbox, {
	describeSandbox: async () => {
		calls.push("describe");
		return {
			hostTarget: "https://box",
			running: !!liveExpiry,
			expiresAt: liveExpiry,
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
	liveExpiry = null;
	storedStatus = "ready";
	writeError = null;
});

describe("watchSandboxExpiry", () => {
	test("follows an extension without asking the provider", async () => {
		storedExpiry = new Date(NOW + 30 * MINUTE);
		expect(await watchSandboxExpiry({ cloudWorkspaceId: "ws_1" })).toBe(
			"rewatched",
		);
		expect(calls).toEqual([]);
		expect(watches).toHaveLength(1);
		expect(watches[0]?.deduplicationId).toBe(`ws_1:${storedExpiry.getTime()}`);
	});

	test("a confirmed stop marks the row asleep, tells clients and settles the meter", async () => {
		storedExpiry = new Date(NOW - 5_000);
		expect(await watchSandboxExpiry({ cloudWorkspaceId: "ws_1" })).toBe(
			"asleep",
		);
		expect(storedStatus).toBe("asleep");
		expect(calls).toEqual(["describe", "nudge", "settle"]);
		expect(watches).toEqual([]);
	});

	test("a box still running past its recorded expiry is recorded awake and watched again", async () => {
		storedExpiry = new Date(NOW - 5_000);
		liveExpiry = new Date(NOW + 20 * MINUTE);
		expect(await watchSandboxExpiry({ cloudWorkspaceId: "ws_1" })).toBe(
			"rewatched",
		);
		expect(storedExpiry).toEqual(liveExpiry);
		expect(storedStatus).toBe("ready");
		expect(calls).toEqual(["describe", "nudge"]);
		expect(watches).toHaveLength(1);
	});

	test("a failed sleep write is reported, not thrown into the box operation it follows", async () => {
		writeError = new Error("db down");
		await expect(
			recordSandboxAwake("ws_1", new Date(NOW + 60 * MINUTE)),
		).resolves.toBeUndefined();
		expect(watches).toEqual([]);
	});
});
