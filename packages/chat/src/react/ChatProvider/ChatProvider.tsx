import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import type {
	ChatTransport,
	LoadHistory,
	StreamSocketFactory,
} from "../../client";
import { ChatSession, createSessionClient, prefetchChat } from "../../client";

/** How to reach the host that runs these chats. */
export type ChatHost = {
	transport: ChatTransport;
	streamBaseUrl: string;
	createSocket: StreamSocketFactory;
};

export type ChatRegistry = {
	host: ChatHost;
	/** The chat for a session: one object however many views ask for it. */
	get(sessionId: string): ChatSession;
	/** Keeps the chat loaded and streaming until the returned release runs. */
	retain(sessionId: string): () => void;
	/** Loads a chat ahead of its first open. */
	prefetch(sessionId: string): Promise<boolean>;
	dispose(): void;
};

type Entry = { chat: ChatSession; views: number; closing: boolean };

export function createChatRegistry(
	host: ChatHost,
	loadHistory?: LoadHistory,
): ChatRegistry {
	const entries = new Map<string, Entry>();
	const clientFor = (sessionId: string) =>
		createSessionClient({ sessionId, ...host, nestedSubagents: true });

	const entryFor = (sessionId: string): Entry => {
		let entry = entries.get(sessionId);
		if (!entry) {
			entry = {
				chat: new ChatSession({ client: clientFor(sessionId), loadHistory }),
				views: 0,
				closing: false,
			};
			entries.set(sessionId, entry);
		}
		return entry;
	};

	const close = (sessionId: string, entry: Entry) => {
		entry.chat.stop();
		entry.chat.client.close();
		if (entries.get(sessionId) === entry) entries.delete(sessionId);
	};

	return {
		host,
		get: (sessionId) => entryFor(sessionId).chat,
		retain(sessionId) {
			const entry = entryFor(sessionId);
			entry.views += 1;
			entry.closing = false;
			if (entry.views === 1) entry.chat.start();
			let released = false;
			return () => {
				if (released) return;
				released = true;
				entry.views -= 1;
				if (entry.views > 0) return;
				// A view that remounts in the same tick keeps its chat open.
				entry.closing = true;
				queueMicrotask(() => {
					if (entry.closing && entry.views === 0) close(sessionId, entry);
				});
			};
		},
		async prefetch(sessionId) {
			const client = clientFor(sessionId);
			try {
				return await prefetchChat(client);
			} finally {
				client.close();
			}
		},
		dispose() {
			for (const [sessionId, entry] of [...entries]) close(sessionId, entry);
		},
	};
}

const ChatRegistryContext = createContext<ChatRegistry | null>(null);

export function ChatProvider({
	children,
	host,
	loadHistory,
}: {
	children: ReactNode;
	host: ChatHost;
	/** A stored copy of a conversation, shown before and in front of the host's own. */
	loadHistory?: LoadHistory;
}) {
	const registry = useMemo(
		() => createChatRegistry(host, loadHistory),
		[host, loadHistory],
	);
	useEffect(() => () => registry.dispose(), [registry]);
	return (
		<ChatRegistryContext.Provider value={registry}>
			{children}
		</ChatRegistryContext.Provider>
	);
}

export function useChatRegistry(): ChatRegistry {
	const registry = useContext(ChatRegistryContext);
	if (!registry) throw new Error("useChat outside a ChatProvider");
	return registry;
}
