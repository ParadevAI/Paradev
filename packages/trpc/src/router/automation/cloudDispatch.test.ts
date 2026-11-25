import { beforeEach, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as transition from "../cloud-workspace/transition";
import { reachablePin } from "./cloudDispatch";

const MINUTE_MS = 60_000;
const failed: unknown[] = [];
let updatedAt: Date;

stub(db.query.cloudWorkspaces, {
	findFirst: async () => ({
		id: "ws_1",
		organizationId: "org_1",
		status: "provisioning",
		providerSandboxId: "box-2",
		createdAt: new Date(Date.now() - 60 * MINUTE_MS),
		updatedAt,
	}),
});
stub(transition, {
	failCloudWorkspace: async (args: unknown) => {
		failed.push(args);
	},
});

beforeEach(() => {
	failed.length = 0;
});

test("a pinned workspace stuck in provisioning fails as create_failed through failCloudWorkspace", async () => {
	updatedAt = new Date(Date.now() - 11 * MINUTE_MS);

	expect(await reachablePin("ws_1")).toBeNull();
	expect(failed).toEqual([
		{
			scope: { cloudWorkspaceId: "ws_1", organizationId: "org_1" },
			from: ["provisioning"],
			providerSandboxId: "box-2",
			reason: "create_failed",
			error: expect.any(Error),
		},
	]);
});

test("a pinned workspace restored long after it was created is still provisioning, not stranded", async () => {
	updatedAt = new Date();

	await expect(reachablePin("ws_1")).rejects.toMatchObject({
		code: "cloud_not_ready",
	});
	expect(failed).toEqual([]);
});
