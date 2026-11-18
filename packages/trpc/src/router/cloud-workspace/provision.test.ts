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

describe("a provision that Autumn refuses", () => {
	const logged: unknown[] = [];
	const captured: unknown[] = [];
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
			throw userError({
				code: "FORBIDDEN",
				message: "limit reached",
				i18nKey: "serverError.cloudWorkspace.usageLimitReached",
			});
		},
		deleteSandbox: async () => {},
	});
	stub(transition, { transitionCloudWorkspace: async () => true });
	stub(realtime, { nudge: () => {} });
	stub(chatMoves, { failChatMovesTo: async () => {} });
	stub(Sentry.logger, {
		warn: (...args: unknown[]) => logged.push(["warn", ...args]),
		error: (...args: unknown[]) => logged.push(["error", ...args]),
	});
	stub(Sentry, {
		captureException: (...args: unknown[]) => captured.push(args),
	});

	test("fails the workspace with a warning and opens no Sentry issue", async () => {
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
					"failure.site": "provision",
					"status.changed": true,
				},
			],
		]);
		expect(captured).toEqual([]);
	});
});
