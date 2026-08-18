import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";

/**
 * The pickable values a Teams sentence needs: the tenant's teams, every
 * channel in them labelled "Team › Channel", and the tenant's people as Entra
 * object ids. All come from Graph through the connection's app token; without
 * a connection all are empty and the chips say so.
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
	const people = cloudTrpc.integration.microsoftTeams.listPeople.useQuery(
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
				people: people.data ?? [],
			},
		}),
		[teams.data, channels.data, people.data],
	);
}
