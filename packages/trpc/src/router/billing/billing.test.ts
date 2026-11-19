import { describe, expect, test } from "bun:test";
import * as autumnBilling from "@superset/auth/billing";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
let role: "owner" | "admin" | "member" | null = null;
let billingReads = 0;

stub(db.query.members, {
	findFirst: async () => (role ? { role } : undefined),
});
stub(autumnBilling, {
	organizationBilling: async () => {
		billingReads += 1;
		return { cloudUsage: { usedGbMinutes: 60 } };
	},
});

const { billingRouter } = await import("./billing");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const caller = createCallerFactory(
	createTRPCRouter({ billing: billingRouter }),
)(
	createTRPCContext({
		session: {
			user: { id: "user-1", email: "user@example.com" },
			session: { activeOrganizationId: ORGANIZATION_ID },
		} as never,
		auth: {} as never,
		headers: new Headers(),
		sandboxCaller: null,
	}),
);

describe("billing.cloudUsage", () => {
	test("a member gets none of the organization's cloud usage, and billing is not read", async () => {
		role = "member";
		billingReads = 0;
		expect(await caller.billing.cloudUsage()).toBeNull();
		expect(billingReads).toBe(0);
	});

	test("someone outside the organization is FORBIDDEN", async () => {
		role = null;
		await expect(caller.billing.cloudUsage()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});
});
