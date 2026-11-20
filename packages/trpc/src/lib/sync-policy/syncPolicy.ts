import {
	organizationPlans,
	organizationsInIntegrationGrace,
} from "@superset/auth/billing";

export async function syncingOrganizationIds(
	organizationIds: string[],
): Promise<Set<string>> {
	const plans = await organizationPlans(organizationIds);
	const syncing = new Set(
		[...plans].filter(([, plan]) => plan !== "free").map(([id]) => id),
	);
	const free = [...plans.keys()].filter((id) => !syncing.has(id));
	const grace = await organizationsInIntegrationGrace(free);
	for (const id of grace) syncing.add(id);
	return syncing;
}

export async function organizationSyncsNow(
	organizationId: string,
): Promise<boolean> {
	return (await syncingOrganizationIds([organizationId])).has(organizationId);
}
