/** Who a mention token points at: a Dev or a person, by id. */
export interface MentionRef {
	kind: "dev" | "user";
	id: string;
}

/** A piece of message text: plain text, or a mention token to show as a name. */
export type MentionSegment =
	| { type: "text"; text: string }
	| ({ type: "mention" } & MentionRef);

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const tokenPattern = () => new RegExp(`<@(dev|user):(${UUID})>`, "gi");

/**
 * How a mention is stored in a message: `<@dev:UUID>` or `<@user:UUID>`. Names repeat, so text carries ids; clients
 * and agents render tokens back into names.
 */
export const mentionToken = (ref: MentionRef) => `<@${ref.kind}:${ref.id}>`;

/** The mentions in `text`, in order, without duplicates. */
export function parseMentionTokens(text: string): MentionRef[] {
	const seen = new Set<string>();
	const refs: MentionRef[] = [];
	for (const [, kind, id] of text.matchAll(tokenPattern())) {
		const ref = {
			kind: kind!.toLowerCase() as MentionRef["kind"],
			id: id!.toLowerCase(),
		};
		if (seen.has(`${ref.kind}:${ref.id}`)) continue;
		seen.add(`${ref.kind}:${ref.id}`);
		refs.push(ref);
	}
	return refs;
}

/** Splits text into plain runs and mention tokens, for rendering tokens as pills. */
export function splitMentions(text: string): MentionSegment[] {
	const segments: MentionSegment[] = [];
	let last = 0;
	for (const match of text.matchAll(tokenPattern())) {
		if (match.index > last)
			segments.push({ type: "text", text: text.slice(last, match.index) });
		segments.push({
			type: "mention",
			kind: match[1]!.toLowerCase() as MentionRef["kind"],
			id: match[2]!.toLowerCase(),
		});
		last = match.index + match[0].length;
	}
	if (last < text.length)
		segments.push({ type: "text", text: text.slice(last) });
	return segments;
}

/** Replaces every mention token with `@<label>`; `label` names the Dev or person (or says it's unknown). */
export function renderMentions(
	text: string,
	label: (ref: MentionRef) => string,
): string {
	return splitMentions(text)
		.map((s) => (s.type === "text" ? s.text : `@${label(s)}`))
		.join("");
}
