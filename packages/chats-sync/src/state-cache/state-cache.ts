import type { ChatState } from "@superset/chats-core";
import { isLocalId } from "../optimistic/optimistic.ts";

/** Bumped when `ChatState` changes shape, so an app never draws a cache an older version wrote. */
const VERSION = 1;

/**
 * The state as the app last showed it, as text to keep on the device, so the next launch draws the chats at once while
 * the bootstrap catches up (the status says "Updating…" meanwhile). What only this run had is left out: messages,
 * tasks and sketches still on their way to the server (a later bootstrap would never confirm them) and pages loading.
 */
export function stateCacheText(state: ChatState): string {
	const olderMessages =
		state.olderMessages &&
		Object.fromEntries(
			Object.entries(state.olderMessages).map(([id, o]) => [
				id,
				{ ...o, loading: false },
			]),
		);
	const kept: ChatState = {
		...state,
		messages: state.messages.filter((m) => !isLocalId(m.id)),
		tasks: state.tasks.filter((t) => !isLocalId(t.id)),
		apps: state.apps.filter((a) => !isLocalId(a.id)),
		...(olderMessages ? { olderMessages } : {}),
	};
	return JSON.stringify({ version: VERSION, state: kept });
}

/** The state a cache holds, or null when it's from another version or unreadable. */
export function stateFromCache(text: string | null): ChatState | null {
	if (!text) return null;
	try {
		const cached = JSON.parse(text) as { version?: unknown; state?: ChatState };
		if (
			cached.version !== VERSION ||
			!cached.state ||
			typeof cached.state.meId !== "string" ||
			!Array.isArray(cached.state.chats)
		)
			return null;
		return cached.state;
	} catch {
		return null;
	}
}
