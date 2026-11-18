import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import { userError } from "../../i18n-error";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as chatMoves from "../chat-move/utils/queueChatMove";
import * as meter from "./meter";
import { provisionCloudWorkspace } from "./provision";
import * as teardown from "./teardown";

const logged: unknown[] = [];
const captured: unknown[] = [];
let claimError: unknown;
stub(db.query.cloudWorkspaces, {
	findFirst: async () => ({
		id: "ws_1",
		organizationId: "org_1",
		status: "provisioning",
		providerSandboxId: "ws-box",
	}),
});
stub(sandbox, {
	buildSandboxClaim: async () => {
		throw claimError;
	},
	deleteSandbox: async () => {},
	stopSandbox: async () => ({ sessionId: null }),
});
stub(realtime, { nudge: () => {} });
stub(chatMoves, { failChatMovesTo: async () => {} });
stub(Sentry.logger, {
	warn: (...args: unknown[]) => logged.push(["warn", ...args]),
	error: (...args: unknown[]) => logged.push(["error", ...args]),
});
stub(Sentry, {
	captureException: (...args: unknown[]) => captured.push(args),
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

describe("a provision that Autumn refuses", () => {
	stub(db, rowUpdate(true));

	test("fails the workspace with a warning and opens no Sentry issue", async () => {
		logged.length = 0;
		captured.length = 0;
		claimError = userError({
			code: "FORBIDDEN",
			message: "limit reached",
			i18nKey: "serverError.cloudWorkspace.usageLimitReached",
		});
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: "ws_1" })).toBe(
			"failed",
		);
		expect(logged).toEqual([
			[
				"warn",
				"workspace.failed",
				{
					"log.source": "control",
					"cloud_workspace.id": "ws_1",
					"organization.id": "org_1",
					"failure.reason": "usage_limit",
				},
			],
		]);
		expect(captured).toEqual([]);
	});
});

describe("a failed provision records why", () => {
	const sets: { failureReason?: string; failedAt?: Date }[] = [];
	stub(db, rowUpdate(true, sets));

	test("from the error: a refusal of either kind, a host that never answered, anything else", async () => {
		for (claimError of [
			userError({
				code: "FORBIDDEN",
				message: "limit reached",
				i18nKey: "serverError.cloudWorkspace.usageLimitReached",
			}),
			userError({
				code: "FORBIDDEN",
				message: "needs a paid plan",
				i18nKey: "serverError.cloudWorkspace.cloudNeedsPaidPlan",
			}),
			new sandbox.SandboxNotReadyError("ws-box"),
			new Error("create failed"),
		]) {
			await provisionCloudWorkspace({ cloudWorkspaceId: "ws_1" });
		}
		expect(
			sets.map((set) => [set.failureReason, set.failedAt instanceof Date]),
		).toEqual([
			["usage_limit", true],
			["needs_paid_plan", true],
			["host_not_ready", true],
			["create_failed", true],
		]);
	});
});

describe("a provision whose row another write already moved", () => {
	stub(db, rowUpdate(false));

	test("writes no workspace.failed and opens no Sentry issue", async () => {
		logged.length = 0;
		captured.length = 0;
		claimError = new Error("create failed");
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: "ws_1" })).toBe(
			"failed",
		);
		expect(logged).toEqual([]);
		expect(captured).toEqual([]);
	});
});

describe("a provision whose host answered", () => {
	const authorized: { traceId: string; transactionTraceId?: string }[] = [];
	const sets: Record<string, unknown>[] = [];
	const at = 1_789_000_000_000;
	stub(sandbox, {
		buildSandboxClaim: async () => ({
			claim: { vcpus: 4 },
			environment: {},
			agentCredentialDigest: "digest",
		}),
		provisionSandbox: async () => ({
			providerSandboxId: "ws-box",
			sandboxUrl: "https://box.test",
			hostTarget: "https://box.test",
			expiresAt: null,
			sessionId: "sess_1",
		}),
		settleSandbox: async () => ({
			stamps: [
				{ phase: "boot.start", at },
				{ phase: "host.ready", at: at + 700 },
			],
			answeredAt: at + 750,
		}),
	});
	stub(meter, {
		authorizeBoot: async (args: { traceId: string }) => {
			const active = Sentry.getActiveSpan();
			const transaction = active && Sentry.getRootSpan(active);
			authorized.push({
				traceId: args.traceId,
				transactionTraceId: transaction?.spanContext().traceId,
			});
			return { bootId: "boot_1" };
		},
		attachBootSession: async () => {},
	});
	stub(chatMoves, { queueChatMovesTo: async () => {} });
	stub(db, {
		update: () => ({
			set: (values: Record<string, unknown>) => {
				sets.push(values);
				return {
					where: () =>
						Object.assign(Promise.resolve([]), {
							returning: async () => [{ id: "ws_1" }],
						}),
				};
			},
		}),
	});

	test("authorizes the boot with the provision's trace id and stores the box's phases", async () => {
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: "ws_1" })).toBe(
			"provisioned",
		);
		expect(authorized[0]?.transactionTraceId).toMatch(/^[0-9a-f]{32}$/);
		expect(authorized[0]?.traceId).toBe(authorized[0]?.transactionTraceId);
		expect(sets.filter((set) => "phases" in set)).toEqual([
			{
				phases: [
					{ name: "boot.start", source: "box", at, ms: 700 },
					{ name: "host.ready", source: "box", at: at + 700, ms: 50 },
				],
			},
		]);
	});
});

describe("a failed create of a workspace without a drive", () => {
	const tornDown: unknown[] = [];
	const deleted: string[] = [];
	stub(db, rowUpdate(true));
	stub(sandbox, {
		buildSandboxClaim: async () => {
			throw new Error("create failed");
		},
		deleteSandbox: async (id: string) => {
			deleted.push(id);
		},
	});
	stub(teardown, {
		deleteSandboxAndDriveLater: async (args: unknown) => {
			tornDown.push(args);
		},
	});

	test("hands its box to the retried teardown under the name it had, and deletes nothing inline", async () => {
		await provisionCloudWorkspace({ cloudWorkspaceId: "ws_1" });
		expect(tornDown).toEqual([
			{ providerSandboxId: "ws-box", driveName: null },
		]);
		expect(deleted).toEqual([]);
	});
});
