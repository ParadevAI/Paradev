import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";

/** The pickable values a Slack sentence needs: channels and workspace members. */
export function useSlackOptions(organizationId: string): ProviderOptions {
	// Channel ids, not names — a channel can be renamed and the trigger must
	// keep matching it afterwards. Same for people: Slack user ids.
	const channels = cloudTrpc.integration.slack.listChannels.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);
	const people = cloudTrpc.integration.slack.listPeople.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);

	return useMemo(
		() => ({
			slack: {
				channels: (channels.data ?? []).map((channel) => ({
					id: channel.id,
					label: `#${channel.name}`,
				})),
				people: people.data ?? [],
			},
		}),
		[channels.data, people.data],
	);
}
