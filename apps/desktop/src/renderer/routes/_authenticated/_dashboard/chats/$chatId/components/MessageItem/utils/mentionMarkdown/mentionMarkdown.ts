import { type MentionRef, splitMentions } from "@superset/chats-core";

export const MENTION_HREF = "#mention/";

const escaped = (label: string) => label.replace(/[[\]\\]/g, "\\$&");

/** A message's markdown with each mention token as a link the message renders as a pill. */
export function mentionMarkdown(
	text: string,
	nameOf: (ref: MentionRef) => string,
): string {
	return splitMentions(text)
		.map((segment) =>
			segment.type === "text"
				? segment.text
				: `[@${escaped(nameOf(segment))}](${MENTION_HREF}${segment.kind}/${segment.id})`,
		)
		.join("");
}
