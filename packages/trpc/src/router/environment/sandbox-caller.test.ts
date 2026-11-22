import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as guards from "../../lib/cloud-guards";
import * as environmentBuild from "../../lib/sandbox/environment-build";

const BOX_ORGANIZATION_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER_ORGANIZATION_ID = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f";
const OTHER_ENVIRONMENT_ID = "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c";
const REPOSITORY_ID = "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f";

const started: string[] = [];

stub(db.query.environments, {
	findFirst: async () => ({
		id: OTHER_ENVIRONMENT_ID,
		organizationId: OTHER_ORGANIZATION_ID,
		scope: "organization",
		createdByUserId: "user-1",
	}),
});
stub(guards, { assertCloudAccess: async () => {} });
stub(environmentBuild, {
	startEnvironmentBuild: async ({
		environmentId,
	}: {
		environmentId: string;
	}) => {
		started.push(environmentId);
		throw new Error("must not start");
	},
});

const { environmentRouter } = await import("./environment");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const box = createCallerFactory(
	createTRPCRouter({ environment: environmentRouter }),
)(
	createTRPCContext({
		session: {
			user: { id: "user-1", email: "user@example.com" },
			session: { activeOrganizationId: BOX_ORGANIZATION_ID },
		} as never,
		auth: {} as never,
		headers: new Headers(),
		sandboxCaller: {
			workspaceId: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
			organizationId: BOX_ORGANIZATION_ID,
			userId: "user-1",
		},
	}),
);

describe("environment procedures called from a cloud workspace", () => {
	test("act only in the box's own organization, whatever the input names", async () => {
		await expect(
			box.environment.create({
				organizationId: OTHER_ORGANIZATION_ID,
				name: "elsewhere",
				repositoryIds: [REPOSITORY_ID],
				primaryRepositoryId: REPOSITORY_ID,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			box.environment.rebuild({ environmentId: OTHER_ENVIRONMENT_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			box.environment.builds({ environmentId: OTHER_ENVIRONMENT_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(started).toEqual([]);
	});
});
