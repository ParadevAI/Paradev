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
