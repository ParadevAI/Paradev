import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import { userError } from "../../i18n-error";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as chatMoves from "../chat-move/utils/queueChatMove";
import { provisionCloudWorkspace } from "./provision";
import * as transition from "./transition";

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

describe("a provision that Autumn refuses", () => {
	stub(transition, { transitionCloudWorkspace: async () => true });

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
	const failed: unknown[] = [];
	stub(transition, {
		transitionCloudWorkspace: async (args: {
			set: { failureReason?: string; failedAt?: Date };
		}) => {
			failed.push([args.set.failureReason, args.set.failedAt instanceof Date]);
			return true;
		},
	});

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
		expect(failed).toEqual([
			["usage_limit", true],
			["needs_paid_plan", true],
			["host_not_ready", true],
			["create_failed", true],
		]);
	});
});

describe("a provision whose row another write already moved", () => {
	stub(transition, { transitionCloudWorkspace: async () => false });

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
