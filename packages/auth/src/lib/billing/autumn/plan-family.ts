import {
	DEFAULT_MACHINE_SIZE,
	familyForPlan,
	machineSpec,
	type PlanFamily,
} from "@superset/shared/billing";

export interface EmailPlan {
	family: string;
	name: string;
	previousName: string | null;
	cloudHoursPerSeat: number | null;
	rank: number;
}

export function cloudHoursPerSeat(family: PlanFamily): number | null {
	if (!family.gbMinutesPerSeat) return null;
	return Math.round(
		family.gbMinutesPerSeat / 60 / machineSpec(DEFAULT_MACHINE_SIZE).memoryGb,
	);
}

export function emailPlanFor(
	catalog: PlanFamily[],
	autumnPlanId: string | null,
): EmailPlan | null {
	const match = familyForPlan(catalog, autumnPlanId);
	if (!match) return null;
	const rank = catalog.indexOf(match.family);
	return {
		family: match.family.family,
		name: match.family.name,
		previousName: catalog[rank - 1]?.name ?? null,
		cloudHoursPerSeat: cloudHoursPerSeat(match.family),
		rank,
	};
}

/** The family an organization moved up from, or null for a first plan, a downgrade or no change. */
export function upgradedFrom(
	catalog: PlanFamily[],
	previousFamily: string | null,
	current: EmailPlan,
): PlanFamily | null {
	if (!previousFamily || previousFamily === current.family) return null;
	const previousRank = catalog.findIndex(
		(family) => family.family === previousFamily,
	);
	return previousRank >= 0 && previousRank < current.rank
		? (catalog[previousRank] ?? null)
		: null;
}
