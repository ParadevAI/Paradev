import {
	type ChatState,
	chatTitle,
	cutLine,
	fileTitle,
	mentionPill,
	messageLine,
	NOTIFICATION_BODY_MAX,
	renderMentions,
} from "@superset/chats-core";
import type { ApiMessage, ApiTask, RealtimeEvent } from "@superset/chats-sync";

/** Where the person is looking when an event arrives. */
export interface Attention {
	openChatId: string | null;
	focused: boolean;
}

const GROUP_PREFIX = "chat:";

export const chatNotificationGroup = (chatId: string) =>
	`${GROUP_PREFIX}${chatId}`;

/** The chat a notification's reply goes to, or null for another feature's target. */
export const chatOfReplyTarget = (target: string) =>
	target.startsWith(GROUP_PREFIX) ? target.slice(GROUP_PREFIX.length) : null;

/**
 * The desktop notification a realtime event gets, or null: only new messages
 * and questions, never the viewer's own, a note with no author, or one in the
 * chat they are looking at.
 */
export function chatNotification(
	state: ChatState,
	event: RealtimeEvent,
	attention: Attention,
) {
	if (event.type === "message.created")
		return messageNotification(state, event.message, event.task, attention);
	if (event.type === "question.asked")
		return messageNotification(state, event.message, null, attention);
	return null;
}

function messageNotification(
	state: ChatState,
	message: ApiMessage,
	task: ApiTask | null,
	attention: Attention,
) {
	if (message.authorId === state.meId) return null;
	if (attention.focused && attention.openChatId === message.groupId)
		return null;
	const chat = state.chats.find((entry) => entry.id === message.groupId);
	if (!chat) return null;
	const author = message.authorDevId
		? state.devs[message.authorDevId]?.name
		: message.authorId
			? state.members[message.authorId]?.name
			: undefined;
	if (!author) return null;
	const line = messageLine({
		text: renderMentions(
			message.text,
			(ref) => mentionPill(state, chat, ref).name,
		),
		taskTitle: task?.title,
		appName: message.appId
			? state.apps.find((app) => app.id === message.appId)?.name
			: null,
		questionTitle: message.question?.title,
		fileName: message.file ? fileTitle(message.file) : null,
	});
	const group = chatNotificationGroup(chat.id);
	return {
		title: author,
		subtitle: chat.kind === "group" ? chatTitle(state, chat) : undefined,
		body: cutLine(line, NOTIFICATION_BODY_MAX),
		clickPath: `/chats/${chat.id}`,
		id: message.id,
		groupId: group,
		replyTarget: group,
	};
}
