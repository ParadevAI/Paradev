import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";

/**
 * The pickable values a Teams sentence needs: the tenant's teams, and every
 * channel in them labelled "Team › Channel". Both come from Graph through the
 * connection's app token; without a connection both are empty and the chips
 * say so.
 */
export function useTeamsOptions(organizationId: string): ProviderOptions {
	const teams = cloudTrpc.integration.microsoftTeams.listTeams.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId), staleTime: 5 * 60 * 1000 },
	);
	const channels = cloudTrpc.integration.microsoftTeams.listChannels.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId), staleTime: 5 * 60 * 1000 },
	);

	return useMemo(
		() => ({
			microsoftTeams: {
				teams: teams.data ?? [],
				channels: (channels.data ?? []).map((channel) => ({
					id: channel.id,
					label: channel.label,
				})),
			},
		}),
		[teams.data, channels.data],
	);
}
