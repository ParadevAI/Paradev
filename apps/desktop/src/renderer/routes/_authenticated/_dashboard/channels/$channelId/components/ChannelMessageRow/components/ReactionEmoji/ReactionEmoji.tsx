import { slackEmojiChar } from "../../../../utils/slackEmoji";

interface ReactionEmojiProps {
	name: string;
	className?: string;
}

/** A reaction's emoji from its Slack shortcode, or the shortcode when it has no character. */
export function ReactionEmoji({ name, className }: ReactionEmojiProps) {
	return (
		<span className={className}>{slackEmojiChar(name) ?? `:${name}:`}</span>
	);
}
