export type BillingRole = "owner" | "admin" | "member";

export const ROUTE_ROLES = {
	attach: ["owner"],
	updateSubscription: ["owner"],
	openCustomerPortal: ["owner"],
	previewAttach: ["owner", "admin"],
	previewUpdateSubscription: ["owner", "admin"],
	getOrCreateCustomer: ["owner", "admin"],
	aggregateEvents: ["owner", "admin"],
	listPlans: ["owner", "admin", "member"],
} as const satisfies Record<string, readonly BillingRole[]>;

export const OWNER_EXPAND = [
	"subscriptions.plan",
	"flags.feature",
	"balances.feature",
	"invoices",
	"payment_method",
	"billing_details",
] as const;
export const ADMIN_EXPAND = [
	"subscriptions.plan",
	"flags.feature",
	"balances.feature",
] as const;

const SELF_SERVE_PLAN_IDS: ReadonlySet<string> = new Set(["pro", "pro_annual"]);

export function selfServePlan(planId: string): boolean {
	return SELF_SERVE_PLAN_IDS.has(planId);
}

export function checkoutSessionParams(args: {
	planId: string;
	organizationId: string;
	userId: string;
	cancelUrl?: string;
}): Record<string, unknown> {
	return {
		...(args.cancelUrl ? { cancel_url: args.cancelUrl } : {}),
		allow_promotion_codes: !args.planId.endsWith("_annual"),
		billing_address_collection: "required",
		tax_id_collection: { enabled: true },
		customer_update: { name: "auto", address: "auto" },
		metadata: {
			organizationId: args.organizationId,
			initiatedByUserId: args.userId,
		},
		subscription_data: {
			metadata: { organizationId: args.organizationId, userId: args.userId },
		},
	};
}
