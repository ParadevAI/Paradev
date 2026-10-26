import type { MessageMentionGroup } from "@superset/chat-ui/MessageComposer";
import { useCallback, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ChannelPerson } from "../../components/ChannelMessageRow";
import { MentionPersonRow } from "../../components/MentionPersonRow";
import {
	type MentionCandidate,
	rankMentionCandidates,
} from "../../utils/mentionGroups";

/** The @ menu for a channel: its members first, then everyone else in the org. */
export function useChannelMentionGroups({
	channelId,
	people,
	currentUserId,
}: {
	channelId: string;
	people: ChannelPerson[];
	currentUserId: string | null;
}) {
	const { data: members } = cloudTrpc.channel.members.useQuery({ channelId });
	const memberIds = useMemo(
		() => new Set((members ?? []).map((member) => member.userId)),
		[members],
	);
	return useCallback(
		(query: string): MessageMentionGroup[] => {
			const { members: inChannel, others } = rankMentionCandidates(
				people,
				memberIds,
				query,
			);
			const toEntry = (person: MentionCandidate, isMember: boolean) => ({
				id: person.id,
				chip: {
					label: person.name,
					serialized: `@${person.name}`,
					data: { userId: person.id },
				},
				row: (
					<MentionPersonRow
						userId={person.id}
						name={person.name}
						image={person.image}
						isSelf={person.id === currentUserId}
						isMember={isMember}
					/>
				),
			});
			return [
				{ id: "members", entries: inChannel.map((p) => toEntry(p, true)) },
				{ id: "others", entries: others.map((p) => toEntry(p, false)) },
			];
		},
		[people, memberIds, currentUserId],
	);
}

/** The user ids of the people a composer's chips mention. */
export function mentionedUserIds(
	mentions: readonly { data?: unknown }[],
): string[] {
	return mentions.flatMap((chip) => {
		const data = chip.data as { userId?: unknown } | undefined;
		return typeof data?.userId === "string" ? [data.userId] : [];
	});
}
