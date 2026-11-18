import type { ListedChatSession } from "../chatSessionsToAdopt";

interface StoredChat {
	id: string;
	title: string | null;
	harness: string | null;
	lastActiveAt: Date | string;
}

/**
 * A cloud workspace's stored chats in the shape its box lists them, for a
 * first open before the box answers. The database does not know which chats
 * were closed, so each counts as live until the box says otherwise.
 */
export function storedChatsAsListed(
	chats: readonly StoredChat[],
): ListedChatSession[] {
	return chats.flatMap((chat) =>
		chat.harness
			? [
					{
						sessionId: chat.id,
						harness: chat.harness,
						harnessSessionId: null,
						title: chat.title,
						updatedAt: new Date(chat.lastActiveAt).getTime(),
						live: true,
						terminalId: null,
					},
				]
			: [],
	);
}
