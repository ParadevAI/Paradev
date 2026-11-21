import type { OutboxEntry, StoredItem } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { hasUserMessage } from "../hasUserMessage";

export function heldOutboxEntries(
	queued: readonly UserContent[][],
	sent: {
		launched: UserContent[] | undefined;
		items: ReadonlyMap<string, StoredItem>;
	},
): OutboxEntry[] {
	const launch =
		sent.launched && !hasUserMessage(sent.items) ? [sent.launched] : [];
	return [...launch, ...queued].map((content, index) => ({
		commandId: `held-${index}`,
		clientId: `held-${index}`,
		content,
		state: "queued",
		attempts: 0,
		lastError: null,
	}));
}
