import { beforeEach, describe, expect, test } from "bun:test";
import { autumnClient } from "@superset/auth/autumn";
import * as billing from "@superset/auth/billing";
import { db } from "@superset/db/client";
import { cloudWorkspaceBoots } from "@superset/db/schema";
import { AutumnError } from "autumn-js";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import type { BoxSession } from "../../lib/sandbox";
import * as sandbox from "../../lib/sandbox";
import { sessionEndedAt } from "../../lib/sandbox/vercel";
import * as jobs from "./jobs";
import {
	assertMayBoot,
	authorizeBoot,
	gbMinutes,
	lockIdFor,
	reconcileCloudWorkspaceUsage,
	refusalFor,
	releaseBoot,
	settleBoot,
} from "./meter";

const MINUTE = 60_000;
const NOW = Date.now();

let boot: Record<string, unknown> | null;
let session: BoxSession | null;
let renewalAllowed: boolean;
let finalizeError: Error | null;
let trackError: Error | null;
let renewalError: Error | null;
let writes: Record<string, unknown>[];
let autumnCalls: { method: string; params: unknown; headers?: unknown }[];
let stopped: string[];
let usageStopAt: Date | null;
let delayedSettles: number[];
type UsageEvent = {
	featureId: string;
	value: number;
	properties: Record<string, unknown>;
};
let usageEvents: UsageEvent[] | null;
let reservations: Map<string, UsageEvent>;

function chain(rows: () => unknown[], onFrom?: (table: unknown) => void) {
	const link = {
		set: (values: Record<string, unknown>) => {
			writes.push(values);
			return link;
		},
		from: (table: unknown) => {
			onFrom?.(table);
			return link;
		},
		where: () =>
			Object.assign(Promise.resolve().then(rows), {
				returning: async () => rows(),
				limit: async () => rows(),
			}),
	};
	return link;
}

stub(db, {
	update: () => chain(() => (boot ? [boot] : [])),
	insert: () => ({
		values: async (values: Record<string, unknown>) => {
			writes.push(values);
		},
	}),
	select: () => {
		let source: unknown;
		return chain(
			() =>
				source === cloudWorkspaceBoots
					? boot
						? [boot]
						: []
					: [
							{
								providerSandboxId: "ws-box",
								createdByUserId: "user_1",
								usageStopAt,
							},
						],
			(table) => {
				source = table;
			},
		);
	},
});
stub(sandbox, {
	findSandboxSession: async () => ({ session }),
	stopSandbox: async (id: string) => {
		stopped.push(id);
	},
});
stub(realtime, { nudge: () => {} });
stub(jobs, {
	publishCloudWorkspaceJob: async (job: { delaySeconds?: number }) => {
		delayedSettles.push(job.delaySeconds ?? 0);
	},
});
stub(autumnClient, {
	check: async (params: unknown) => {
		autumnCalls.push({ method: "check", params });
		if (renewalError) throw renewalError;
		const check = params as Parameters<typeof autumnClient.check>[0];
		if (usageEvents && check.lock && renewalAllowed) {
			const event = {
				featureId: check.featureId,
				value: check.requiredBalance ?? 1,
				properties: check.properties ?? {},
			};
			reservations.set(check.lock.lockId, event);
			usageEvents.push(event);
		}
		return { allowed: renewalAllowed, balance: { remaining: 0 }, flag: null };
	},
	track: async (params: unknown, options?: { headers?: unknown }) => {
		autumnCalls.push({ method: "track", params, headers: options?.headers });
		if (trackError) throw trackError;
		const track = params as Parameters<typeof autumnClient.track>[0];
		if (usageEvents && track.featureId) {
			usageEvents.push({
				featureId: track.featureId,
				value: track.value ?? 1,
				properties: track.properties ?? {},
			});
		}
		return { balance: {} };
	},
});
stub(autumnClient.balances, {
	finalize: async (params: unknown, options?: { headers?: unknown }) => {
		autumnCalls.push({ method: "finalize", params, headers: options?.headers });
		if (finalizeError) throw finalizeError;
		const finalize = params as Parameters<
			typeof autumnClient.balances.finalize
		>[0];
		const reservation = reservations.get(finalize.lockId);
		if (usageEvents && reservation) {
			const finalValue =
				finalize.action === "release"
					? 0
					: (finalize.overrideValue ?? reservation.value);
			usageEvents.push({
				featureId: reservation.featureId,
				value: finalValue - reservation.value,
				properties: finalize.properties ?? reservation.properties,
			});
			reservations.delete(finalize.lockId);
		}
		return { success: true };
	},
});

function autumnError(status: number) {
	return new AutumnError(`status ${status}`, {
		response: new Response("", { status }),
		request: new Request("https://api.useautumn.com/v1"),
		body: "",
	});
}

beforeEach(() => {
	boot = {
		id: "boot_1",
		organizationId: "org_1",
		cloudWorkspaceId: "ws_1",
		vercelSessionId: "sess_1",
		lockSeq: 0,
		lockOpen: true,
		finalizedThrough: new Date(NOW - 10 * MINUTE),
		createdAt: new Date(NOW - 20 * MINUTE),
	};
	session = {
		id: "sess_1",
		memoryMb: 16_384,
		vcpus: 8,
		startedAt: NOW - 20 * MINUTE,
		endedAt: null,
		activeCpuMs: null,
	};
	renewalAllowed = true;
	finalizeError = null;
	trackError = null;
	renewalError = null;
	writes = [];
	autumnCalls = [];
	stopped = [];
	usageStopAt = null;
	delayedSettles = [];
	usageEvents = null;
	reservations = new Map();
});

describe("settleBoot", () => {
	test("a running box is billed since the last settle and gets its next lock", async () => {
		expect(await settleBoot("boot_1")).toBe("renewed");
		const finalize = autumnCalls.find((call) => call.method === "finalize");
		expect(finalize?.params).toMatchObject({
			lockId: "boot_1:0",
			action: "confirm",
		});
		expect(
			(finalize?.params as { overrideValue: number }).overrideValue,
		).toBeCloseTo(160, 0);
		expect(
			autumnCalls.find((call) => call.method === "check")?.params,
		).toMatchObject({
			lock: { lockId: "boot_1:1" },
		});
		expect(writes.at(-1)).toMatchObject({ lockSeq: 1, lockOpen: true });
	});

	test("a stopped box is billed to its stop, records its CPU unbilled, and closes", async () => {
		session = {
			...(session as BoxSession),
			endedAt: NOW - 4 * MINUTE,
			activeCpuMs: 3 * MINUTE,
		};
		expect(await settleBoot("boot_1")).toBe("closed");
		expect(
			(
				autumnCalls.find((call) => call.method === "finalize")?.params as {
					overrideValue: number;
				}
			).overrideValue,
		).toBeCloseTo(96, 5);
		expect(
			autumnCalls.find((call) => call.method === "track")?.params,
		).toMatchObject({
			featureId: "active_cpu_minutes",
			value: 3,
			properties: { userId: "user_1", bootId: "boot_1" },
		});
		expect(autumnCalls.some((call) => call.method === "check")).toBe(false);
		expect(writes).toContainEqual(expect.objectContaining({ lockOpen: false }));
		expect(writes.at(-1)).toMatchObject({
			stoppedAt: new Date(NOW - 4 * MINUTE),
		});
	});

	test("failed CPU delivery is retried without billing memory twice", async () => {
		const endedAt = NOW - 4 * MINUTE;
		session = { ...(session as BoxSession), endedAt, activeCpuMs: 3 * MINUTE };
		trackError = autumnError(503);
		await expect(settleBoot("boot_1")).rejects.toThrow("status 503");
		expect(writes.some((write) => "stoppedAt" in write)).toBe(false);
		boot = { ...boot, finalizedThrough: new Date(endedAt), lockOpen: false };
		trackError = null;
		autumnCalls = [];
		expect(await settleBoot("boot_1")).toBe("closed");
		expect(autumnCalls.map((call) => call.method)).toEqual(["track"]);
		expect(autumnCalls[0]?.headers).toEqual({
			"Idempotency-Key": "boot_1:active-cpu",
		});
	});

	test("an already-recorded CPU event closes the boot without retrying forever", async () => {
		session = {
			...(session as BoxSession),
			endedAt: NOW,
			activeCpuMs: 3 * MINUTE,
		};
		trackError = autumnError(409);
		expect(await settleBoot("boot_1")).toBe("closed");
	});

	test("a box refused at the spend cap is warned and given ten minutes, not stopped", async () => {
		renewalAllowed = false;
		expect(await settleBoot("boot_1")).toBe("warned");
		expect(stopped).toEqual([]);
		const stopAt = writes.find((write) => "usageStopAt" in write)
			?.usageStopAt as Date;
		expect(stopAt.getTime() - Date.now()).toBeGreaterThan(9 * MINUTE);
		expect(delayedSettles).toEqual([600]);
		expect(writes).toContainEqual(
			expect.objectContaining({ lockSeq: 1, lockOpen: false }),
		);
	});

	test("a box still refused once its grace ends is stopped and the warning cleared", async () => {
		renewalAllowed = false;
		usageStopAt = new Date(NOW - MINUTE);
		expect(await settleBoot("boot_1")).toBe("stopped");
		expect(stopped).toEqual(["ws-box"]);
		expect(writes.at(-1)).toEqual({ usageStopAt: null });
	});

	test("a raised limit during the grace clears the warning and keeps the box running", async () => {
		usageStopAt = new Date(NOW + 5 * MINUTE);
		expect(await settleBoot("boot_1")).toBe("renewed");
		expect(stopped).toEqual([]);
		expect(writes.at(-1)).toEqual({ usageStopAt: null });
	});

	test("an old boot closing after a restart leaves the new boot's stop deadline alone", async () => {
		usageStopAt = new Date(NOW + 5 * MINUTE);
		session = { ...(session as BoxSession), endedAt: NOW - MINUTE };
		expect(await settleBoot("boot_1")).toBe("closed");
		expect(writes).not.toContainEqual({ usageStopAt: null });
	});

	test("renewals carry the owner and finalization inherits its reservation attribution", async () => {
		await settleBoot("boot_1");
		expect(
			autumnCalls.find((call) => call.method === "check")?.params,
		).toMatchObject({
			properties: { userId: "user_1", bootId: "boot_1", lockSeq: 1 },
		});
		expect(
			autumnCalls.find((call) => call.method === "finalize")?.params,
		).not.toHaveProperty("properties");
	});

	test("minutes a lock can no longer take are tracked once, keyed by that lock", async () => {
		finalizeError = autumnError(400);
		await settleBoot("boot_1");
		const track = autumnCalls.find(
			(call) =>
				call.method === "track" &&
				(call.params as { featureId: string }).featureId === "box_gb_minutes",
		);
		expect(track?.headers).toEqual({
			"Idempotency-Key": `boot_1:0:track:${NOW - 10 * MINUTE}`,
		});
	});

	test("a track Autumn already recorded under that key counts as recorded", async () => {
		finalizeError = autumnError(400);
		trackError = autumnError(409);
		expect(await settleBoot("boot_1")).toBe("renewed");
	});

	test("a track that fails for another reason keeps the boot unsettled", async () => {
		finalizeError = autumnError(400);
		trackError = new Error("network down");
		await expect(settleBoot("boot_1")).rejects.toThrow("network down");
	});

	test("a confirm Autumn already took under that key is not tracked again", async () => {
		finalizeError = autumnError(409);
		expect(await settleBoot("boot_1")).toBe("renewed");
		expect(
			autumnCalls.find((call) => call.method === "finalize")?.headers,
		).toEqual({ "Idempotency-Key": "boot_1:0:confirm" });
		expect(autumnCalls.some((call) => call.method === "track")).toBe(false);
	});

	test("a confirm that fails on Autumn's side is retried, not tracked", async () => {
		finalizeError = autumnError(503);
		await expect(settleBoot("boot_1")).rejects.toThrow("status 503");
		expect(autumnCalls.some((call) => call.method === "track")).toBe(false);
	});

	test("a settle whose next lock fails keeps the billed window, so a retry does not confirm it again", async () => {
		renewalError = new Error("autumn down");
		await expect(settleBoot("boot_1")).rejects.toThrow("autumn down");
		expect(writes).toContainEqual(
			expect.objectContaining({
				lockOpen: false,
				finalizedThrough: expect.any(Date),
			}),
		);
	});

	test("a boot another run is settling is left alone", async () => {
		boot = null;
		expect(await settleBoot("boot_1")).toBe("skipped");
		expect(autumnCalls).toEqual([]);
	});
});

describe("Autumn attribution and Vercel runtime parity", () => {
	stub(billing, { ensureAutumnCustomer: async () => ({ id: "org_1" }) });

	async function reserve(userId: string | null = "user_1") {
		usageEvents = [];
		const { bootId } = await authorizeBoot(
			{
				organizationId: "org_1",
				cloudWorkspaceId: "ws_1",
				createdByUserId: userId,
				memoryMb: 16_384,
				vcpus: 8,
			},
			{ billingEnabled: true },
		);
		if (!bootId) throw new Error("Missing authorized boot");
		boot = { ...boot, id: bootId, finalizedThrough: null };
		return bootId;
	}

	function userTotal(featureId: string, userId = "user_1") {
		return (usageEvents ?? [])
			.filter(
				(event) =>
					event.featureId === featureId && event.properties.userId === userId,
			)
			.reduce((sum, event) => sum + event.value, 0);
	}

	test("settled per-user GB-minutes exactly equal the provider session duration", async () => {
		const bootId = await reserve();
		session = {
			...(session as BoxSession),
			endedAt: NOW,
			activeCpuMs: 2 * MINUTE,
		};
		expect(await settleBoot(bootId)).toBe("closed");
		const expected = gbMinutes({
			ms: NOW - session.startedAt,
			memoryMb: session.memoryMb,
		});
		expect(userTotal("box_gb_minutes")).toBe(expected);
		expect(userTotal("active_cpu_minutes")).toBe(2);
		expect(
			usageEvents
				?.filter((event) => event.featureId === "box_gb_minutes")
				.map((event) => event.value),
		).toEqual([480, expected - 480]);
		expect(autumnCalls.filter((call) => call.method === "track")).toHaveLength(
			1,
		);
	});

	test("a running counter contains finalized runtime plus the next reservation", async () => {
		const bootId = await reserve();
		await settleBoot(bootId);
		const confirmed = (
			autumnCalls.find((call) => call.method === "finalize")?.params as {
				overrideValue: number;
			}
		).overrideValue;
		expect(userTotal("box_gb_minutes")).toBeCloseTo(confirmed + 480, 6);
		expect(reservations.size).toBe(1);
	});

	test("a release refunds the same user instead of leaving a negative user-only total", async () => {
		const bootId = await reserve();
		await releaseBoot(bootId);
		expect(userTotal("box_gb_minutes")).toBe(0);
		expect(reservations.size).toBe(0);
	});

	test("a workspace without a creator has an explicit unattributed bucket", async () => {
		await reserve(null);
		expect(userTotal("box_gb_minutes", "unattributed")).toBe(480);
	});
});

describe("meter", () => {
	test("usage is GB-minutes: minutes the box was up times its memory in GB", () => {
		expect(gbMinutes({ ms: 60_000, memoryMb: 16_384 })).toBe(16);
		expect(gbMinutes({ ms: 30_000, memoryMb: 2_048 })).toBe(1);
		expect(gbMinutes({ ms: -5_000, memoryMb: 16_384 })).toBe(0);
	});

	test("each lock of a boot has its own id, so a retry reuses the same one", () => {
		expect(lockIdFor("boot_1", 0)).toBe("boot_1:0");
		expect(lockIdFor("boot_1", 3)).toBe("boot_1:3");
	});

	test("a free org is told cloud needs a paid plan; a paid org at its cap is told it hit its limit", () => {
		expect(refusalFor({ allowed: true, balance: null })).toBeNull();
		expect(refusalFor({ allowed: false, balance: null })).toBe(
			"cloudNeedsPaidPlan",
		);
		expect(refusalFor({ allowed: false, balance: { remaining: 0 } })).toBe(
			"usageLimitReached",
		);
	});

	test("a session that ended without a stop time ends at its last update", () => {
		expect(sessionEndedAt({ status: "running", updatedAt: 9 })).toBeNull();
		expect(
			sessionEndedAt({ status: "stopped", stoppedAt: 5, updatedAt: 9 }),
		).toBe(5);
		expect(
			sessionEndedAt({ status: "stopping", requestedStopAt: 4, updatedAt: 9 }),
		).toBe(4);
		expect(sessionEndedAt({ status: "aborted", updatedAt: 9 })).toBe(9);
	});
});

describe("with BILLING_PROVIDER=stripe", () => {
	test("boxes start, wake and reconcile without asking Autumn", async () => {
		await assertMayBoot("org_1", 4);
		expect(
			await authorizeBoot({
				organizationId: "org_1",
				cloudWorkspaceId: "ws_1",
				createdByUserId: "user_1",
				memoryMb: 16_384,
				vcpus: 8,
			}),
		).toEqual({ bootId: null });
		expect(await reconcileCloudWorkspaceUsage()).toEqual({
			adopted: 0,
			queued: 0,
			failed: 0,
		});
		expect(autumnCalls).toEqual([]);
	});
});
