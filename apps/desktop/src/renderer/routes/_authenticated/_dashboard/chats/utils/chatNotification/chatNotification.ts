import {
	type ChatState,
	chatTitle,
	messageCopyText,
} from "@superset/chats-core";
import type { ApiMessage } from "@superset/chats-sync";

const BODY_MAX = 240;

/**
 * What a new message shows as a desktop notification, or null when it gets
 * none: the viewer's own message, a note with no author, or a chat they are
 * not in.
 */
export function chatNotification(
	state: ChatState,
	message: Pick<
		ApiMessage,
		"id" | "groupId" | "authorId" | "authorDevId" | "text"
	>,
) {
	if (message.authorId === state.meId) return null;
	if (!message.authorId && !message.authorDevId) return null;
	const chat = state.chats.find((entry) => entry.id === message.groupId);
	if (!chat) return null;
	const author = message.authorDevId
		? state.devs[message.authorDevId]?.name
		: message.authorId
			? state.members[message.authorId]?.name
			: undefined;
	if (!author) return null;
	const text = messageCopyText(state, {
		id: message.id,
		chatId: message.groupId,
		authorId: message.authorId,
		authorDevId: message.authorDevId ?? undefined,
		text: message.text,
		at: "",
	});
	return {
		title: author,
		subtitle: chat.kind === "group" ? chatTitle(state, chat) : undefined,
		body: text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text,
		clickPath: `/chats/${chat.id}`,
		id: message.id,
		groupId: `chat:${chat.id}`,
	};
}
