import type { ChatState } from "@superset/chats-core";
import { keepOlderMessages } from "../message-history/message-history.ts";
import { mergeRefresh } from "../optimistic/optimistic.ts";

/** Whether a client's first bootstrap has landed, or why it didn't. */
export type LoadStatus =
	| { kind: "loading" }
	| { kind: "ready" }
	| { kind: "error"; message: string };

export type StoreAction =
	| { type: "refresh"; fresh: ChatState; confirmedClientIds: Set<string> }
	| { type: "update"; change: (s: ChatState) => ChatState };

/**
 * A client's chat state: null until the first bootstrap, which a later one merges into (keeping local changes the
 * server hasn't confirmed yet, and older history it paged in); changes before the first bootstrap have nothing to apply to.
 */
export function syncStoreReducer(
	state: ChatState | null,
	action: StoreAction,
): ChatState | null {
	if (action.type === "refresh")
		return state
			? mergeRefresh(
					state,
					keepOlderMessages(state, action.fresh),
					action.confirmedClientIds,
				)
			: action.fresh;
	return state ? action.change(state) : state;
}
