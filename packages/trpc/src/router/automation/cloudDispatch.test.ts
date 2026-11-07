import { expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as cloudGuards from "../../lib/cloud-guards";
import { runInCloud } from "./cloudDispatch";
import type { DispatchableAutomation } from "./dispatch";

const HOUR_MS = 60 * 60_000;
const transitions: unknown[] = [];

stub(db, {
	select: () => ({
		from: () => ({
			where: () => ({ limit: async () => [{ id: "member-1" }] }),
		}),
	}),
	update: () => ({
		set: (values: unknown) => ({
			where: () => ({
				returning: async () => {
					transitions.push(values);
					return [{ id: "ws-1" }];
				},
			}),
		}),
	}),
});
stub(db.query.cloudWorkspaces, {
	findFirst: async () => ({
		id: "ws-1",
		status: "provisioning",
		providerSandboxId: "box-2",
		createdAt: new Date(Date.now() - HOUR_MS),
		updatedAt: new Date(),
	}),
});
stub(cloudGuards, { cloudAccess: async () => ({ enabled: true }) });

test("a pinned workspace restored long after it was created is still provisioning, not stranded", async () => {
	const run = runInCloud({
		automation: {
			organizationId: "org-1",
			ownerUserId: "user-1",
			cloudWorkspaceId: "ws-1",
		} as DispatchableAutomation,
		runId: "run-1",
		prompt: "go",
		event: null,
		placed: () => {},
	});

	await expect(run).rejects.toMatchObject({ code: "cloud_not_ready" });
	expect(transitions).toEqual([]);
});
