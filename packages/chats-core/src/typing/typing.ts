import type { ChatState } from "../chat-state/chat-state.ts";

/**
 * The line under a chat's thread while people type in it, as Messages and WhatsApp put it: "Nina is typing…", "Nina
 * and Sam are typing…", "Several people are typing…". `typists` are the people typing (their user ids, in the order
 * they started); the viewer and anyone no longer in the chat are left out. Null when nobody else is typing.
 */
export function typingLabel(
	state: ChatState,
	chatId: string,
	typists: readonly string[],
): string | null {
	const chat = state.chats.find((c) => c.id === chatId);
	if (!chat) return null;
	const names = typists
		.filter((id) => id !== state.meId && chat.memberIds.includes(id))
		.map((id) => state.members[id]?.name ?? "Someone");
	if (names.length === 0) return null;
	if (names.length === 1) return `${names[0]} is typing…`;
	if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
	return "Several people are typing…";
}
