import {
	displayText,
	emptySnapshot,
	parseAttachmentTags,
	reduceMany,
	userMessageText,
} from "@superset/chat/core";
import { type Envelope, userMessageSchema } from "@superset/chat/protocol";

export type PreviewMessage = {
	id: string;
	from: "user" | "agent";
	text: string;
};

const MAX_MESSAGES = 4;
const MAX_CHARACTERS = 220;

function excerpt(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > MAX_CHARACTERS
		? `${flat.slice(0, MAX_CHARACTERS - 1).trimEnd()}…`
		: flat;
}

/** The last few things said in a chat, as plain one-paragraph excerpts. */
export function previewMessages(
	envelopes: readonly Envelope[],
): PreviewMessage[] {
	const snapshot = reduceMany(emptySnapshot(), envelopes);
	const messages: PreviewMessage[] = [];
	for (const [id, { item }] of snapshot.items) {
		const user = userMessageSchema.safeParse(item);
		if (user.success) {
			if (user.data.discarded || user.data.queued) continue;
			const typed = parseAttachmentTags(userMessageText(user.data, "\n"));
			const text = excerpt(
				typed.text || (typed.pastedTexts[0] ?? typed.quotes[0] ?? ""),
			);
			if (text) messages.push({ id, from: "user", text });
		} else if (item.kind === "agent_message") {
			const text = excerpt(displayText(snapshot, id));
			if (text) messages.push({ id, from: "agent", text });
		}
	}
	return messages.slice(-MAX_MESSAGES);
}
