import type { UserMessage } from "@superset/chat/protocol";
import { create } from "zustand";

interface ChatMode {
	id: string;
	label: string;
}

export interface ActiveChat {
	modes: ChatMode[];
	currentModeId: string | undefined;
	running: boolean;
	queued: UserMessage[];
	queuePaused: boolean;
	queueControls: boolean;
	selectMode: (modeId: string) => void;
	stop: () => void;
	steerQueued: (itemId: string) => void;
	removeQueued: (itemId: string) => void;
	resumeQueue: () => void;
}

const noop = () => {};

const EMPTY: ActiveChat = {
	modes: [],
	currentModeId: undefined,
	running: false,
	queued: [],
	queuePaused: false,
	queueControls: false,
	selectMode: noop,
	stop: noop,
	steerQueued: noop,
	removeQueued: noop,
	resumeQueue: noop,
};

interface ActiveChatStore {
	bySessionId: Record<string, ActiveChat>;
	publish: (sessionId: string, chat: ActiveChat) => void;
	clear: (sessionId: string) => void;
}

export const useActiveChatStore = create<ActiveChatStore>()((set) => ({
	bySessionId: {},
	publish: (sessionId, chat) =>
		set((state) => ({
			bySessionId: { ...state.bySessionId, [sessionId]: chat },
		})),
	clear: (sessionId) =>
		set((state) => {
			const { [sessionId]: _cleared, ...bySessionId } = state.bySessionId;
			return { bySessionId };
		}),
}));

export function useActiveChat(
	sessionId: string | null | undefined,
): ActiveChat {
	return useActiveChatStore((state) =>
		sessionId ? (state.bySessionId[sessionId] ?? EMPTY) : EMPTY,
	);
}
