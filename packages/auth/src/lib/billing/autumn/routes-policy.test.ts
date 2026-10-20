import { describe, expect, test } from "bun:test";
import {
	ADMIN_EXPAND,
	checkoutSessionParams,
	OWNER_EXPAND,
	ROUTE_ROLES,
	selfServePlan,
} from "./routes-policy";

describe("billing routes keep today's owner and admin rules", () => {
	test("only owners can buy, change or open the portal", () => {
		expect(ROUTE_ROLES.attach).toEqual(["owner"]);
		expect(ROUTE_ROLES.updateSubscription).toEqual(["owner"]);
		expect(ROUTE_ROLES.openCustomerPortal).toEqual(["owner"]);
	});

	test("admins can read and preview, members can only list plans", () => {
		expect(ROUTE_ROLES.previewAttach).toContain("admin");
		expect(ROUTE_ROLES.getOrCreateCustomer).not.toContain("member");
		expect(ROUTE_ROLES.listPlans).toContain("member");
	});

	test("card and billing address stay owner-only", () => {
		expect(OWNER_EXPAND).toContain("payment_method");
		expect(ADMIN_EXPAND).not.toContain("payment_method");
		expect(ADMIN_EXPAND).not.toContain("billing_details");
		expect(ADMIN_EXPAND).not.toContain("invoices");
	});

	test("enterprise plans cannot be bought from the app", () => {
		expect(selfServePlan("pro")).toBe(true);
		expect(selfServePlan("pro_annual")).toBe(true);
		expect(selfServePlan("pro_internal_discount")).toBe(false);
		expect(selfServePlan("enterprise")).toBe(false);
		expect(selfServePlan("enterprise_acme")).toBe(false);
	});

	test("checkout settings are the server's: address required, codes only on monthly, org metadata", () => {
		expect(
			checkoutSessionParams({
				planId: "pro",
				organizationId: "org_1",
				userId: "user_1",
			}),
		).toEqual({
			allow_promotion_codes: true,
			billing_address_collection: "required",
			tax_id_collection: { enabled: true },
			customer_update: { name: "auto", address: "auto" },
			metadata: { organizationId: "org_1", initiatedByUserId: "user_1" },
			subscription_data: {
				metadata: { organizationId: "org_1", userId: "user_1" },
			},
		});
		expect(
			checkoutSessionParams({
				planId: "pro_annual",
				organizationId: "org_1",
				userId: "user_1",
			}).allow_promotion_codes,
		).toBe(false);
	});
});
