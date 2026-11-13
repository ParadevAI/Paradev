import { type TurnGroup, userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";

/** The last turn's prompt, as sent, when the agent did nothing with it; otherwise undefined. */
export function unrunPrompt(groups: TurnGroup[]): string | undefined {
	const entries = groups.at(-1)?.entries ?? [];
	let prompt: string | undefined;
	for (const entry of entries) {
		if (entry.kind !== "item") return undefined;
		if (entry.item.kind === "user_message") {
			prompt = userMessageText(entry.item as UserMessage);
		} else if (entry.item.kind !== "notice") {
			return undefined;
		}
	}
	return prompt?.trim() ? prompt : undefined;
}
