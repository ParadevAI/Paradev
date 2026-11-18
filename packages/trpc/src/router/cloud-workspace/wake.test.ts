import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as meter from "./meter";
import * as sandboxExpiry from "./sandbox-expiry";
import * as sandboxSleep from "./sandbox-sleep";
import * as transition from "./transition";
import {
	markSandboxUnavailable,
	restartCloudWorkspace,
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

describe("markSandboxUnavailable", () => {
	stub(realtime, { nudge: () => {} });

	describe("when the row moves to failed", () => {
		const captured: unknown[] = [];
		stub(transition, { transitionCloudWorkspace: async () => true });
		stub(Sentry, {
			captureException: (...args: unknown[]) => captured.push(args),
		});

		test("captures the error with the ids as tags", async () => {
			const error = new Error("gone");
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

	describe("when the row was already moved", () => {
		const captured: unknown[] = [];
		stub(transition, { transitionCloudWorkspace: async () => false });
		stub(Sentry, {
			captureException: (...args: unknown[]) => captured.push(args),
		});

		test("does not capture it again", async () => {
			await markSandboxUnavailable(ROW, new Error("gone"));
			expect(captured).toEqual([]);
		});
	});
});
