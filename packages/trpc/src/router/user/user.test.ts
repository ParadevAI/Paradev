import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { and, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as accountPurge from "../../lib/account-purge";
import * as activationEvents from "../../lib/activation-events";
import { posthog } from "../../lib/analytics";
import * as disconnect from "../../lib/connectors/disconnect";

let soleOwner: boolean;
let disconnected: boolean;
let deletionRequested: boolean;

beforeEach(() => {
	soleOwner = false;
	disconnected = false;
	deletionRequested = false;
});

stub(accountPurge, {
	findOrganizationSolelyOwnedBy: async () => (soleOwner ? "org-1" : null),
});
stub(disconnect, {
	deleteGoogleConnections: async (conditions: SQL[]) => {
		const where = and(...conditions);
		if (!where) throw new Error("Missing connection selection");
		const query = new PgDialect().sqlToQuery(where);
		expect(query.params).toEqual(["creator", "user"]);
		expect(query.sql).toContain('"connections"."connected_by_user_id"');
		expect(query.sql).toContain('"connections"."owner_kind"');
		disconnected = true;
		return [];
	},
});
stub(db, {
	update: () => ({
		set: (value: { deletionRequestedAt: Date }) => ({
			where: async () => {
				deletionRequested = value.deletionRequestedAt instanceof Date;
			},
		}),
	}),
	delete: () => ({ where: async () => {} }),
});

const membership = (organizationId: string) => ({
	organizationId,
	organization: { id: organizationId },
});

stub(db.query.members, {
	findMany: async () => [membership("box-org"), membership("other-org")],
});
stub(posthog, { capture: () => {}, isFeatureEnabled: async () => false });
stub(activationEvents, { emitAppFirstOpened: async () => {} });

const { userRouter } = await import("./user");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const callerFor = (
	sandboxCaller: {
		workspaceId: string;
		organizationId: string;
		userId: string;
	} | null,
) =>
	createCallerFactory(createTRPCRouter({ user: userRouter }))(
		createTRPCContext({
			session: {
				user: { id: "creator", email: "creator@example.com" },
				session: { activeOrganizationId: "box-org" },
			} as never,
			auth: {} as never,
			headers: new Headers(),
			sandboxCaller,
		}),
	);

describe("user.myOrganizations", () => {
	test("lists only a box's own organization", async () => {
		const box = callerFor({
			workspaceId: "box",
			organizationId: "box-org",
			userId: "creator",
		});
		expect((await box.user.myOrganizations()).map((org) => org.id)).toEqual([
			"box-org",
		]);
	});

	test("lists every organization for a signed-in client", async () => {
		expect(
			(await callerFor(null).user.myOrganizations()).map((org) => org.id),
		).toEqual(["box-org", "other-org"]);
	});
});

describe("user.deleteAccount", () => {
	test("removes personal Google access when the recovery period begins", async () => {
		expect(await callerFor(null).user.deleteAccount()).toEqual({
			success: true,
		});
		expect(disconnected).toBe(true);
		expect(deletionRequested).toBe(true);
	});

	test("does not disconnect Google when account deletion is refused", async () => {
		soleOwner = true;
		await expect(callerFor(null).user.deleteAccount()).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect(disconnected).toBe(false);
		expect(deletionRequested).toBe(false);
	});
});
