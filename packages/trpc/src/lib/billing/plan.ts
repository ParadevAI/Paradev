import { billingUsesAutumn } from "@superset/auth/autumn";
import {
	organizationEnvironmentLimitFromAutumn,
	organizationGatedMachineSizesFromAutumn,
} from "@superset/auth/billing";
import {
	DEFAULT_ENVIRONMENT_LIMIT,
	defaultMachineSize,
	isMachineSize,
	MACHINE_SIZE_VCPUS,
	type MachineSize,
	offeredMachineSizes,
} from "@superset/shared/billing";

export { organizationPlan, organizationPlans } from "@superset/auth/billing";

export interface OrganizationMachineSizes {
	sizes: MachineSize[];
	defaultSize: MachineSize;
}

/** Small, medium and large for everyone; bigger sizes only while Autumn turns them on. */
export async function organizationMachineSizes(
	organizationId: string,
): Promise<OrganizationMachineSizes> {
	const gated = billingUsesAutumn
		? await organizationGatedMachineSizesFromAutumn(organizationId)
		: [];
	const sizes = offeredMachineSizes(gated);
	return { sizes, defaultSize: defaultMachineSize(sizes) };
}

export async function resolveMachineSize(
	organizationId: string,
	requested: string | null | undefined,
): Promise<{ name: MachineSize; vcpus: number } | null> {
	const { sizes, defaultSize } = await organizationMachineSizes(organizationId);
	const name = requested ?? defaultSize;
	if (!isMachineSize(name) || !sizes.includes(name)) return null;
	return { name, vcpus: MACHINE_SIZE_VCPUS[name] };
}

/**
 * Environments the org may hold: the plan's `environments` feature in Autumn,
 * `Infinity` when that is unlimited, and DEFAULT_ENVIRONMENT_LIMIT while the
 * plan carries no such feature or billing is not on Autumn.
 */
export async function organizationEnvironmentLimit(
	organizationId: string,
): Promise<number> {
	const limit = billingUsesAutumn
		? await organizationEnvironmentLimitFromAutumn(organizationId)
		: null;
	if (limit === "unlimited") return Number.POSITIVE_INFINITY;
	return limit ?? DEFAULT_ENVIRONMENT_LIMIT;
}
