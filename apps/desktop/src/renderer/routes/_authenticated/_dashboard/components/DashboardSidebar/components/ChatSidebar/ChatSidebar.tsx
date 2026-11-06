import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	channelTag,
	useChannelAgentCounts,
} from "renderer/routes/_authenticated/_dashboard/channels/$channelId/hooks/useChannelAgents";
import { useCoordinatorPreviews } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/hooks/useCoordinatorPreviews";
import { useRecordChannelsActivity } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/stores/channelActivityStore";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { AttentionStrip } from "./components/AttentionStrip";
import { ChannelsSection } from "./components/ChannelsSection";
import { DevsSection } from "./components/DevsSection";
import { MarkAllReadShortcut } from "./components/MarkAllReadShortcut";
import {
	type Attention,
	type ChatSidebarFilter,
	channelAttention,
	devAttention,
	keepsUnder,
	NO_ATTENTION,
} from "./utils/attention";

/** The sidebar of the Chat section: every channel and Dev, one line each, with what needs you. */
export function ChatSidebar() {
	const organizationId = useActiveOrganizationId();
	const listInput = { organizationId: organizationId ?? "" };
	const enabled = organizationId !== null;
	const { data: channels = [] } = cloudTrpc.channel.list.useQuery(listInput, {
		enabled,
	});
	const { data: devs = [] } = cloudTrpc.agent.list.useQuery(listInput, {
		enabled,
	});
	const agentCounts = useChannelAgentCounts();
	useRecordChannelsActivity(channels);
	const channelIds = useMemo(
		() => channels.map((channel) => channel.id),
		[channels],
	);
	const previews = useCoordinatorPreviews(channelIds);
	const [filter, setFilter] = useState<ChatSidebarFilter | null>(null);
	const attention = useMemo(
		() =>
			new Map<string, Attention>([
				...channels.map((channel): [string, Attention] => [
					channel.id,
					channelAttention(
						channel,
						agentCounts.get(channelTag(channel.name)),
						previews.get(channel.id),
					),
				]),
				...devs.map((dev): [string, Attention] => [dev.id, devAttention(dev)]),
			]),
		[channels, devs, agentCounts, previews],
	);
	const totals = useMemo(() => {
		let needsYou = 0;
		let running = 0;
		for (const entry of attention.values()) {
			needsYou += entry.needsYou;
			running += entry.running;
		}
		return { needsYou, running };
	}, [attention]);
	const keeps = (id: string) =>
		keepsUnder(filter, attention.get(id) ?? NO_ATTENTION);
	const { t } = useLingui();
	const { people, currentUserId } = useOrganizationPeople();
	const authorName = (id: string | null): string | null => {
		if (!id) return null;
		if (id === currentUserId) return t({ message: "You" });
		const person = people.find((candidate) => candidate.id === id);
		if (person) return person.name.split(/\s+/)[0] ?? person.name;
		return devs.find((dev) => dev.id === id)?.name ?? null;
	};

	return (
		<div className="flex flex-col gap-2 pt-2">
			<AttentionStrip totals={totals} filter={filter} onChange={setFilter} />
			<ChannelsSection
				channels={channels.filter((channel) => keeps(channel.id))}
				attention={attention}
				previews={previews}
				authorName={authorName}
				filtered={filter !== null}
			/>
			<DevsSection
				devs={devs.filter((dev) => keeps(dev.id))}
				attention={attention}
				filtered={filter !== null}
			/>
			{organizationId && (
				<MarkAllReadShortcut organizationId={organizationId} />
			)}
		</div>
	);
}
