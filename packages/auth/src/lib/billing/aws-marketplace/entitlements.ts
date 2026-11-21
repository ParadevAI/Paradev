import type { Entitlement } from "./api";

/** Contract dimension API names in the AWS listing, lowest plan first. */
export const AWS_MARKETPLACE_DIMENSIONS = [
	"pro_seats",
	"team_seats",
	"ultra_seats",
	"enterprise_seats",
] as const;

export type AwsMarketplaceDimension =
	(typeof AWS_MARKETPLACE_DIMENSIONS)[number];

export function dimensionPlanIds(
	enterprisePlanId: string,
): Record<AwsMarketplaceDimension, string> {
	return {
		pro_seats: "pro_v2",
		team_seats: "team",
		ultra_seats: "ultra",
		enterprise_seats: enterprisePlanId,
	};
}

export interface AwsMarketplacePlan {
	dimension: AwsMarketplaceDimension;
	planId: string;
	seats: number;
	expiresAt: Date | null;
}

function isDimension(
	value: string | undefined,
): value is AwsMarketplaceDimension {
	return (AWS_MARKETPLACE_DIMENSIONS as readonly string[]).includes(
		value ?? "",
	);
}

/**
 * The plan a license's entitlements buy: the highest plan dimension with a
 * positive seat count that has not expired. Null means no access.
 */
export function planFromEntitlements(
	entitlements: Entitlement[],
	planIds: Record<AwsMarketplaceDimension, string>,
	now: Date,
): AwsMarketplacePlan | null {
	let best: AwsMarketplacePlan | null = null;
	for (const entitlement of entitlements) {
		if (!isDimension(entitlement.Dimension)) continue;
		const seats = entitlement.Value?.IntegerValue;
		if (!seats || !Number.isInteger(seats) || seats <= 0) continue;
		const expiresAt = entitlement.ExpirationDate
			? new Date(entitlement.ExpirationDate)
			: null;
		if (expiresAt && expiresAt <= now) continue;
		const candidate: AwsMarketplacePlan = {
			dimension: entitlement.Dimension,
			planId: planIds[entitlement.Dimension],
			seats,
			expiresAt,
		};
		if (!best) {
			best = candidate;
			continue;
		}
		const rank = AWS_MARKETPLACE_DIMENSIONS.indexOf(candidate.dimension);
		const bestRank = AWS_MARKETPLACE_DIMENSIONS.indexOf(best.dimension);
		if (rank > bestRank || (rank === bestRank && seats > best.seats)) {
			best = candidate;
		}
	}
	return best;
}
