import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as chatMoves from "../chat-move/utils/queueChatMove";
import * as jobs from "./jobs";
import { queueProvision } from "./start";
import * as transition from "./transition";

describe("a provision that cannot be queued", () => {
	const nudged: unknown[] = [];
	stub(jobs, {
		publishCloudWorkspaceJob: async () => {
			throw new Error("queue down");
		},
	});
	stub(transition, { transitionCloudWorkspace: async () => true });
	stub(realtime, { nudge: (...args: unknown[]) => nudged.push(args) });
	stub(chatMoves, { failChatMovesTo: async () => {} });
	stub(Sentry, { captureException: () => "" });

	test("tells the organization's clients that the row failed", async () => {
		await expect(
			queueProvision({ cloudWorkspaceId: "ws_1" }, "org_1"),
		).rejects.toThrow();
		expect(nudged).toEqual([["org_1", "cloud_workspaces"]]);
	});
});
