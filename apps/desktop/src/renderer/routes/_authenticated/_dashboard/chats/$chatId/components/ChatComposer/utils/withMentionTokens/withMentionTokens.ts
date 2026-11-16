import { type MentionCandidate, mentionToken } from "@superset/chats-core";

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Puts the id tokens back in place of the names picked from the list, longest name first. */
export function withMentionTokens(
	text: string,
	picked: Pick<MentionCandidate, "kind" | "id" | "label">[],
): string {
	return [...picked]
		.sort((a, b) => b.label.length - a.label.length)
		.reduce(
			(result, candidate) =>
				result.replace(
					new RegExp(`@${escaped(candidate.label)}(?![\\p{L}\\p{N}_])`, "gu"),
					() => mentionToken(candidate),
				),
			text,
		);
}
