import { useLingui } from "@lingui/react/macro";
import type { UserMessage } from "@superset/chat/protocol";
import { useMemo } from "react";
import { LuDiamond } from "react-icons/lu";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import type { TranscriptCards } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { PersonAvatar } from "../../components/PersonAvatar";
import { SpeakerMark } from "../../components/SpeakerMark";

// The host stamps every prompt that arrives through its sessions API (the
// CLI's `sessions create --prompt` and `sessions send`) with this client id.
const SESSIONS_API_CLIENT_ID = "superset-sessions";

/**
 * Who speaks in a channel's chat: the person, by their name and picture, and
 * the agent, by the name it goes by here. Undefined agent name means the
 * channel's coordinator. In an agent's chat, prompts that came through the
 * sessions API are the coordinator's.
 */
export function useChannelSpeakers(
	agentName?: string,
): NonNullable<TranscriptCards["speakers"]> {
	const { t } = useLingui();
	const { people, currentUserId } = useOrganizationPeople();
	const me = people.find((person) => person.id === currentUserId);
	return useMemo(() => {
		const userName = me?.name ?? t({ message: "You" });
		const coordinator = {
			name: t({ message: "Coordinator" }),
			avatar: <SpeakerMark name="" icon={<LuDiamond />} />,
			badge: t({ message: "Agent" }),
		};
		const agent =
			agentName === undefined
				? coordinator
				: {
						name: agentName,
						avatar: <SpeakerMark name={agentName} />,
						badge: t({ message: "Agent" }),
					};
		return {
			...(agentName === undefined
				? {}
				: {
						relay: {
							...coordinator,
							sent: (message: UserMessage) =>
								message.clientId === SESSIONS_API_CLIENT_ID,
						},
					}),
			user: {
				name: userName,
				avatar: (
					<PersonAvatar
						name={userName}
						image={me?.image ?? null}
						className="size-7 text-[11px]"
					/>
				),
			},
			agent,
		};
	}, [me?.name, me?.image, agentName, t]);
}
