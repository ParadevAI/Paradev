import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ChatSession, ChatState } from "../../client";
import { useChatRegistry } from "../ChatProvider";

export type Chat = ChatState & {
	/** The chat's actions; the same object for as long as the session is. Null for a draft. */
	actions: ChatSession | null;
};

const DRAFT: ChatState = {
	status: "ready",
	session: null,
	turns: [],
	queue: { prompts: [], paused: false },
	older: "none",
};

const getDraft = () => DRAFT;
const subscribeToNothing = () => () => {};

/** One chat by its session id. Null is a draft: a chat that has no session yet. */
export function useChat(sessionId: string | null): Chat {
	const registry = useChatRegistry();
	const chat = useMemo(
		() => (sessionId ? registry.get(sessionId) : null),
		[registry, sessionId],
	);
	useEffect(
		() => (sessionId ? registry.retain(sessionId) : undefined),
		[registry, sessionId],
	);
	const state = useSyncExternalStore(
		chat?.subscribe ?? subscribeToNothing,
		chat?.getState ?? getDraft,
		chat?.getState ?? getDraft,
	);
	return useMemo(() => ({ ...state, actions: chat }), [state, chat]);
}
