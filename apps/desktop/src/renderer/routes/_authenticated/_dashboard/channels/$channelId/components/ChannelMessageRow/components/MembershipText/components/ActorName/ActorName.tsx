import { useLingui } from "@lingui/react/macro";
import { PersonHoverCard } from "../../../../../PersonHoverCard";
import type { ChannelPerson } from "../../../../ChannelMessageRow";

interface ActorNameProps {
	actorId: string;
	channelId: string;
	peopleById: Map<string, ChannelPerson>;
	devNames: Map<string, string>;
	currentUserId: string | null;
}

export function ActorName({
	actorId,
	channelId,
	peopleById,
	devNames,
	currentUserId,
}: ActorNameProps) {
	const { t } = useLingui();
	const person = peopleById.get(actorId);
	if (!person) {
		return <span>{devNames.get(actorId) ?? t({ message: "Unknown" })}</span>;
	}
	return (
		<PersonHoverCard
			channelId={channelId}
			person={person}
			isSelf={person.id === currentUserId}
		>
			<span className="hover:underline">{person.name}</span>
		</PersonHoverCard>
	);
}
