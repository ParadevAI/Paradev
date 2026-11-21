import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as chatMoves from "../chat-move/utils/queueChatMove";
import * as jobs from "./jobs";
import { queueProvision } from "./start";

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

describe("a provision that cannot be queued", () => {
	const nudged: unknown[] = [];
	stub(jobs, {
		publishCloudWorkspaceJob: async () => {
			throw new Error("queue down");
		},
	});
	const sets: { failureReason?: string }[] = [];
	stub(db, rowUpdate(true, sets));
	stub(realtime, { nudge: (...args: unknown[]) => nudged.push(args) });
	stub(chatMoves, { failChatMovesTo: async () => {} });
	stub(Sentry, { captureException: () => "" });

	test("tells the organization's clients that the row failed", async () => {
		await expect(
			queueProvision({ cloudWorkspaceId: "ws_1" }, "org_1"),
		).rejects.toThrow();
		expect(nudged).toEqual([["org_1", "cloud_workspaces"]]);
	});

	test("records the failure as queue_failed", async () => {
		sets.length = 0;
		await expect(
			queueProvision({ cloudWorkspaceId: "ws_1" }, "org_1"),
		).rejects.toThrow();
		expect(sets.map((set) => set.failureReason)).toEqual(["queue_failed"]);
	});
});
