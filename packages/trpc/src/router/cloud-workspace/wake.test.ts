import { beforeEach, describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { APIError } from "@vercel/sandbox";
import { stub } from "../../../test/stub";
import { userError } from "../../i18n-error";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as meter from "./meter";
import * as sandboxExpiry from "./sandbox-expiry";
import * as sandboxSleep from "./sandbox-sleep";
import {
	markSandboxUnavailable,
	restartCloudWorkspace,
	wakeAfterStop,
	wakeCloudWorkspace,
} from "./wake";

type Row = Parameters<typeof wakeCloudWorkspace>[0];
const ROW = {
	id: "ws_1",
	organizationId: "org_1",
	providerSandboxId: "ws-box",
	sandboxUrl: "https://box.test",
	bootAgentCredentialDigest: "digest",
} as Row;

describe("restartCloudWorkspace", () => {
	const recordedAsleep: Array<[string, { sessionId: string | null }]> = [];
	stub(sandbox, {
		describeSandbox: async () => ({ running: true }),
		stopAndSnapshot: async () => ({ sessionId: "session_1" }),
		buildSandboxClaim: async () => {
			throw new Error("wake not under test");
		},
	});
	stub(meter, { queueSettleWorkspace: async () => {} });
	stub(sandboxSleep, {
		recordSandboxAsleep: async (
			id: string,
			stopped: { sessionId: string | null },
		) => {
			recordedAsleep.push([id, stopped]);
		},
		recordBootEnd: async () => {},
	});

	test("records asleep only for the session it stopped, before the wake", async () => {
		await expect(
			restartCloudWorkspace({
				id: "ws_1",
				providerSandboxId: "ws-box",
			} as Parameters<typeof restartCloudWorkspace>[0]),
		).rejects.toThrow("wake not under test");
		expect(recordedAsleep).toEqual([["ws_1", { sessionId: "session_1" }]]);
	});
});

describe("a keepalive wake of a serving box", () => {
	const logged: unknown[] = [];
	stub(Sentry.logger, {
		info: (...args: unknown[]) => logged.push(args),
		warn: (...args: unknown[]) => logged.push(args),
		error: (...args: unknown[]) => logged.push(args),
	});
	stub(sandbox, {
		buildSandboxClaim: async () => ({
			claim: {},
			agentCredentialDigest: "digest",
		}),
		wakeSandbox: async () => ({
			hostTarget: "https://box.test",
			booted: false,
			rebooted: false,
			answer: { stamps: [] },
			expiresAt: null,
			sessionId: null,
		}),
	});
	stub(sandboxExpiry, { recordSandboxAwake: async () => {} });

	test("writes no control record", async () => {
		await wakeCloudWorkspace(ROW);
		expect(logged).toEqual([]);
	});
});

describe("wakeAfterStop", () => {
	const calls: string[] = [];
	const recordedAsleep: Array<[string, { sessionId: string | null }]> = [];
	stub(sandbox, {
		buildSandboxClaim: async () => ({
			claim: {},
			agentCredentialDigest: "digest",
		}),
		wakeSandbox: async (args: {
			beforeResume: (box: { memoryMb: number; vcpus: number }) => Promise<void>;
		}) => {
			await args.beforeResume({ memoryMb: 8192, vcpus: 4 });
			return { hostTarget: "https://box.test", answer: { stamps: [] } };
		},
	});
	stub(meter, {
		queueSettleWorkspace: async () => {
			calls.push("settle");
		},
		authorizeBoot: async () => {
			calls.push("authorize");
			return { bootId: "boot_2" };
		},
		attachBootSession: async ({ bootId }: { bootId: string }) => {
			calls.push(`attach ${bootId}`);
		},
	});
	const endedBoots: unknown[] = [];
	stub(sandboxSleep, {
		recordSandboxAsleep: async (
			id: string,
			stopped: { sessionId: string | null },
		) => {
			recordedAsleep.push([id, stopped]);
		},
		recordBootEnd: async (
			scope: { cloudWorkspaceId: string },
			ended: unknown,
		) => {
			endedBoots.push([scope.cloudWorkspaceId, ended]);
		},
	});
	stub(sandboxExpiry, { recordSandboxAwake: async () => {} });
	stub(db, { update: () => ({ set: () => ({ where: async () => [] }) }) });

	test("the box a promote snapshot stopped is recorded asleep, then woken through authorizeBoot and attached", async () => {
		await wakeAfterStop(ROW, { sessionId: "sess_A" });
		expect(recordedAsleep).toEqual([["ws_1", { sessionId: "sess_A" }]]);
		expect(calls).toEqual(["settle", "authorize", "attach boot_2"]);
	});

	test("ends the stopped session's boot as restarted before the wake opens the next", async () => {
		endedBoots.length = 0;
		await wakeAfterStop(ROW, { sessionId: "sess_A" });
		expect(endedBoots).toEqual([
			["ws_1", { sessionId: "sess_A", reason: "restarted" }],
		]);
	});
});

describe("a wake that boots the box", () => {
	const authorized: { traceId: string; transactionTraceId?: string }[] = [];
	const sets: Record<string, unknown>[] = [];
	const captured: unknown[] = [];
	let phasesWriteError: Error | null = null;
	let stamps: { phase: string; at: number }[] = [];
	let apiPhasesError: Error | null = null;
	stub(sandbox, {
		buildSandboxClaim: async () => ({
			claim: {},
			agentCredentialDigest: "digest",
		}),
		apiPhases: () => {
			if (apiPhasesError) throw apiPhasesError;
			return [];
		},
		wakeSandbox: async (args: {
			beforeResume: (box: { memoryMb: number; vcpus: number }) => Promise<void>;
		}) => {
			await args.beforeResume({ memoryMb: 8192, vcpus: 4 });
			return {
				hostTarget: "https://box.test",
				booted: true,
				rebooted: true,
				answer: { stamps, answeredAt: (stamps.at(-1)?.at ?? 0) + 100 },
				expiresAt: null,
				sessionId: "sess_1",
			};
		},
	});
	stub(meter, {
		authorizeBoot: async (args: { traceId: string }) => {
			const active = Sentry.getActiveSpan();
			const transaction = active && Sentry.getRootSpan(active);
			authorized.push({
				traceId: args.traceId,
				transactionTraceId: transaction?.spanContext().traceId,
			});
			return { bootId: "boot_3" };
		},
		attachBootSession: async () => {},
	});
	stub(sandboxExpiry, { recordSandboxAwake: async () => {} });
	stub(db, {
		update: () => ({
			set: (values: Record<string, unknown>) => ({
				where: async () => {
					if ("phases" in values && phasesWriteError) throw phasesWriteError;
					sets.push(values);
					return [];
				},
			}),
		}),
	});
	stub(Sentry, {
		captureException: (...args: unknown[]) => captured.push(args),
	});
	beforeEach(() => {
		authorized.length = 0;
		sets.length = 0;
		captured.length = 0;
		phasesWriteError = null;
		apiPhasesError = null;
		const at = Date.now();
		stamps = [
			{ phase: "boot.start", at },
			{ phase: "rootfs.start", at: at + 50 },
			{ phase: "host.ready", at: at + 900 },
		];
	});

	test("authorizes the boot with the wake's trace id and stores its phases on the row", async () => {
		await wakeCloudWorkspace(ROW);
		expect(authorized[0]?.transactionTraceId).toMatch(/^[0-9a-f]{32}$/);
		expect(authorized[0]?.traceId).toBe(authorized[0]?.transactionTraceId);
		const [start] = stamps;
		expect(sets.filter((set) => "phases" in set)).toEqual([
			{
				phases: [
					{ name: "boot.start", source: "box", at: start?.at, ms: 50 },
					{
						name: "rootfs.start",
						source: "box",
						at: (start?.at ?? 0) + 50,
						ms: 850,
					},
					{
						name: "host.ready",
						source: "box",
						at: (start?.at ?? 0) + 900,
						ms: 100,
					},
				],
			},
		]);
	});

	test("stores at most 64 phases, keeping the last one the host answered after", async () => {
		const at = Date.now();
		stamps = Array.from({ length: 100 }, (_, index) => ({
			phase:
				index === 0
					? "boot.start"
					: index === 99
						? "host.ready"
						: `checkout.cloned-${index}`,
			at: at + index,
		}));
		await wakeCloudWorkspace(ROW);
		const [written] = sets.filter((set) => "phases" in set);
		const phases = written?.phases as { name: string }[];
		expect(phases).toHaveLength(64);
		expect(phases.slice(-2).map((phase) => phase.name)).toEqual([
			"checkout.cloned-62",
			"host.ready",
		]);
	});

	test("a failed phases write or API phase read is reported and the wake still answers", async () => {
		const tags = {
			"cloud_workspace.id": "ws_1",
			"organization.id": "org_1",
			"boot.id": "boot_3",
		};
		phasesWriteError = new Error("db down");
		expect((await wakeCloudWorkspace(ROW)).hostTarget).toBe("https://box.test");
		phasesWriteError = null;
		apiPhasesError = new Error("span gone");
		expect((await wakeCloudWorkspace(ROW)).hostTarget).toBe("https://box.test");
		expect(captured).toEqual([
			[new Error("db down"), { tags }],
			[apiPhasesError, { tags }],
		]);
	});
});

describe("a refused wake", () => {
	const calls: string[] = [];
	const recordedAsleep: Array<[string, { sessionId: string | null }]> = [];
	let resumedSession: { sessionId: string; expiresAt: Date } | undefined;
	stub(sandbox, {
		buildSandboxClaim: async () => ({
			claim: {},
			agentCredentialDigest: "digest",
		}),
		wakeSandbox: async (args: {
			beforeResume: (box: {
				memoryMb: number;
				vcpus: number;
				resumedSession?: { sessionId: string; expiresAt: Date };
			}) => Promise<void>;
		}) => {
			await args.beforeResume({ memoryMb: 16_384, vcpus: 8, resumedSession });
		},
		describeSandbox: async () => ({
			running: true,
			expiresAt: new Date(Date.now() + 60_000),
			sessionId: "sess_B",
		}),
		stopSandbox: async () => {
			calls.push("stop");
			return { sessionId: "sess_C" };
		},
	});
	stub(meter, {
		authorizeBoot: async () => {
			throw userError({
				code: "FORBIDDEN",
				message: "limit reached",
				i18nKey: "serverError.cloudWorkspace.usageLimitReached",
			});
		},
	});
	stub(sandboxExpiry, {
		recordSandboxAwake: async (_: string, session: { sessionId: string }) => {
			calls.push(`awake ${session.sessionId}`);
		},
	});
	stub(sandboxSleep, {
		recordSandboxAsleep: async (
			id: string,
			stopped: { sessionId: string | null },
		) => {
			recordedAsleep.push([id, stopped]);
		},
	});
	beforeEach(() => {
		calls.length = 0;
		recordedAsleep.length = 0;
	});

	test("stops the box a call here resumed, and records it asleep for that session", async () => {
		resumedSession = {
			sessionId: "sess_C",
			expiresAt: new Date(Date.now() + 60_000),
		};
		await expect(wakeCloudWorkspace(ROW)).rejects.toThrow("limit reached");
		expect(calls).toEqual(["awake sess_C", "stop"]);
		expect(recordedAsleep).toEqual([["ws_1", { sessionId: "sess_C" }]]);
	});

	test("leaves alone a box another wake authorized and resumed meanwhile", async () => {
		resumedSession = undefined;
		await expect(wakeCloudWorkspace(ROW)).rejects.toThrow("limit reached");
		expect(calls).toEqual([]);
		expect(recordedAsleep).toEqual([]);
	});
});

/** The row update a failure makes; `moved` says whether the row was still in a `from` status. */
function rowUpdate(moved: boolean, sets: unknown[] = []) {
	return {
		update: () => ({
			set: (values: unknown) => {
				sets.push(values);
				return {
					where: () => ({
						returning: async () => (moved ? [{ id: "ws_1" }] : []),
					}),
				};
			},
		}),
	};
}

describe("markSandboxUnavailable", () => {
	stub(realtime, { nudge: () => {} });

	describe("when the row moves to failed", () => {
		const captured: unknown[] = [];
		stub(db, rowUpdate(true));
		stub(Sentry, {
			captureException: (...args: unknown[]) => captured.push(args),
		});

		test("captures the error with the ids as tags", async () => {
			const error = new sandbox.SandboxUnavailableError("ws-box");
			await markSandboxUnavailable(ROW, error);
			expect(captured).toEqual([
				[
					error,
					{
						tags: { "cloud_workspace.id": "ws_1", "organization.id": "org_1" },
					},
				],
			]);
		});
	});

	describe("records why the sandbox is unavailable", () => {
		const failed: unknown[] = [];
		stub(db, rowUpdate(true, failed));
		stub(Sentry, { captureException: () => "" });

		test("a 404 is sandbox_gone and a 410 is snapshot_expired", async () => {
			const unavailable = (status: number) =>
				new sandbox.SandboxUnavailableError(
					"ws-box",
					new APIError(new Response(null, { status })),
				);
			await markSandboxUnavailable(ROW, unavailable(404));
			await markSandboxUnavailable(ROW, unavailable(410));
			expect(failed).toEqual([
				{
					sandboxUrl: null,
					failureReason: "sandbox_gone",
					failedAt: expect.any(Date),
					status: "failed",
				},
				{
					sandboxUrl: null,
					failureReason: "snapshot_expired",
					failedAt: expect.any(Date),
					status: "failed",
				},
			]);
		});
	});

	describe("when the row was already moved", () => {
		const captured: unknown[] = [];
		stub(db, rowUpdate(false));
		stub(Sentry, {
			captureException: (...args: unknown[]) => captured.push(args),
		});

		test("does not capture it again", async () => {
			await markSandboxUnavailable(
				ROW,
				new sandbox.SandboxUnavailableError("ws-box"),
			);
			expect(captured).toEqual([]);
		});
	});
});
