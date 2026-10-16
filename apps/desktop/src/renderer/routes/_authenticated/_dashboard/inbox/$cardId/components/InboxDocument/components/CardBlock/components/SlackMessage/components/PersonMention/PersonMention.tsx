import { useSlackWorkspace } from "../../../../providers/SlackWorkspaceProvider";
import { MentionChip } from "../MentionChip";
import { PersonCard } from "../PersonCard";

interface PersonMentionProps {
	id: string;
	/** The name Slack spelled into the mention, when it did. */
	label?: string;
}

/** `@someone` in a message: yellow when it is the reader, with their card on hover. */
export function PersonMention({ id, label }: PersonMentionProps) {
	const person = useSlackWorkspace().people.get(id);
	const chip = (
		<MentionChip
			prefix="@"
			label={label || person?.name || id}
			self={person?.isReader ?? false}
		/>
	);
	return person ? <PersonCard person={person}>{chip}</PersonCard> : chip;
}
