import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as transition from "../cloud-workspace/transition";
import { reachablePin } from "./cloudDispatch";

describe("a pinned workspace stuck in provisioning", () => {
	const failed: unknown[] = [];
	stub(db.query.cloudWorkspaces, {
		findFirst: async () => ({
			id: "ws_1",
			organizationId: "org_1",
			status: "provisioning",
			createdAt: new Date(Date.now() - 11 * 60_000),
		}),
	});
	stub(transition, {
		failCloudWorkspace: async (args: unknown) => {
			failed.push(args);
		},
	});

	test("fails it as create_failed through failCloudWorkspace", async () => {
		expect(await reachablePin("ws_1")).toBeNull();
		expect(failed).toEqual([
			{
				scope: { cloudWorkspaceId: "ws_1", organizationId: "org_1" },
				from: ["provisioning"],
				reason: "create_failed",
				error: expect.any(Error),
			},
		]);
	});
});
