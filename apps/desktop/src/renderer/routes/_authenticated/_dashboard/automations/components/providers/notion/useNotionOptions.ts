import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";

/**
 * The pickable values a Notion sentence needs: the data sources the connected
 * workspace shares with the integration, and the workspace's people (Notion
 * user ids — what a comment's author and mentions carry).
 */
export function useNotionOptions(organizationId: string): ProviderOptions {
	const dataSources = cloudTrpc.integration.notion.listDataSources.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);
	const people = cloudTrpc.integration.notion.listPeople.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);

	return useMemo(
		() => ({
			notion: {
				dataSources: dataSources.data ?? [],
				people: people.data ?? [],
			},
		}),
		[dataSources.data, people.data],
	);
}
