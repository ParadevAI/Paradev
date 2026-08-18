import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";

/**
 * The pickable values a Linear sentence needs: teams, projects, labels and
 * workflow states and members, all from Linear.
 */
export function useLinearOptions(organizationId: string): ProviderOptions {
	const options = cloudTrpc.integration.linear.getTriggerOptions.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);
	const people = cloudTrpc.integration.linear.listPeople.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);

	return useMemo(
		() => ({
			linear: {
				teams: options.data?.teams ?? [],
				projects: options.data?.projects ?? [],
				labels: options.data?.labels ?? [],
				statuses: options.data?.statuses ?? [],
				people: people.data ?? [],
			},
		}),
		[options.data, people.data],
	);
}
