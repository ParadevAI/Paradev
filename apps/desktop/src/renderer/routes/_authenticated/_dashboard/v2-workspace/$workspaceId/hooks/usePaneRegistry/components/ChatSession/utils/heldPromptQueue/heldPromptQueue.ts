import type { StoredItem } from "@superset/chat/core";
import type { UserContent, UserMessage } from "@superset/chat/protocol";

const NOTHING = async () => {};

export function heldPromptQueue(
	queued: UserContent[][],
	sent?: {
		launched: UserContent[] | undefined;
		items: ReadonlyMap<string, StoredItem>;
	},
) {
	const launchedPending =
		sent?.launched !== undefined &&
		![...sent.items.values()].some(({ item }) => item.kind === "user_message");
	const prompts =
		launchedPending && sent?.launched ? [sent.launched, ...queued] : queued;
	if (prompts.length === 0) return undefined;
	return {
		prompts: prompts.map(
			(content, index): UserMessage => ({
				id: `held-${index}`,
				kind: "user_message",
				startedAtMs: 0,
				queued: true,
				content,
			}),
		),
		paused: false,
		actionable: false,
		remove: NOTHING,
		resume: NOTHING,
		steer: NOTHING,
		update: NOTHING,
	};
}
