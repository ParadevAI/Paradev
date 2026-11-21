import type { AwsMarketplacePlan } from "./entitlements";

export type PlanChange =
	| { kind: "none" }
	| { kind: "attach"; planId: string; seats: number }
	| { kind: "update"; planId: string; seats: number }
	| { kind: "cancel"; planId: string };

/** What to do in Autumn to move from the plan AWS last granted to the plan it grants now. */
export function planChange(
	provisioned: { planId: string | null; seats: number | null },
	target: AwsMarketplacePlan | null,
): PlanChange {
	if (!target) {
		return provisioned.planId
			? { kind: "cancel", planId: provisioned.planId }
			: { kind: "none" };
	}
	if (provisioned.planId !== target.planId) {
		return { kind: "attach", planId: target.planId, seats: target.seats };
	}
	if (provisioned.seats !== target.seats) {
		return { kind: "update", planId: target.planId, seats: target.seats };
	}
	return { kind: "none" };
}

type SeatQuantities =
	| {
			licenseQuantities: Array<{ licensePlanId: string; quantity: number }>;
	  }
	| { featureQuantities: Array<{ featureId: string; quantity: number }> };

export interface AutumnPlanWriter {
	ensureCustomer(organizationId: string): Promise<unknown>;
	seatQuantities(planId: string, seats: number): Promise<SeatQuantities>;
	attach(
		params: {
			customerId: string;
			planId: string;
			noBillingChanges: true;
			redirectMode: "never";
		} & SeatQuantities,
	): Promise<unknown>;
	update(
		params: {
			customerId: string;
			planId: string;
			noBillingChanges: true;
			cancelAction?: "cancel_immediately";
		} & Partial<SeatQuantities>,
	): Promise<unknown>;
}

/**
 * Applies a plan change in Autumn without touching Stripe: AWS bills the
 * buyer, so Autumn only records the plan and its seats.
 */
export async function applyPlanChange(
	writer: AutumnPlanWriter,
	organizationId: string,
	change: PlanChange,
): Promise<void> {
	switch (change.kind) {
		case "none":
			return;
		case "attach":
			await writer.ensureCustomer(organizationId);
			await writer.attach({
				customerId: organizationId,
				planId: change.planId,
				noBillingChanges: true,
				redirectMode: "never",
				...(await writer.seatQuantities(change.planId, change.seats)),
			});
			return;
		case "update":
			await writer.update({
				customerId: organizationId,
				planId: change.planId,
				noBillingChanges: true,
				...(await writer.seatQuantities(change.planId, change.seats)),
			});
			return;
		case "cancel":
			await writer.update({
				customerId: organizationId,
				planId: change.planId,
				noBillingChanges: true,
				cancelAction: "cancel_immediately",
			});
			return;
	}
}
