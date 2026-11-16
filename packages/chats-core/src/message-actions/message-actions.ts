import type { ChatState } from "../chat-state/chat-state.ts";
import { lastMatch } from "../last-match/last-match.ts";
import { mentionPill } from "../mention-candidates/mention-candidates.ts";
import { renderMentions } from "../mentions/mentions.ts";
import type { Message, Question, QuestionOption } from "../model/model.ts";
import { fileTitle } from "../shared-files/shared-files.ts";

/**
 * What copying a message puts on the clipboard: its words with mentions as names, the title of the task it shares, or
 * a question as asked (its text is only the title, so the body and options would otherwise be lost), or a file's name
 * with what was said with it.
 */
export function messageCopyText(state: ChatState, message: Message): string {
	const task = message.taskId
		? state.tasks.find((t) => t.id === message.taskId)
		: undefined;
	if (task) return task.title;
	const chat = state.chats.find((c) => c.id === message.chatId);
	const text = message.question
		? questionText(message.question)
		: message.file
			? [fileTitle(message.file), message.text].filter(Boolean).join("\n")
			: message.text;
	return renderMentions(text, (ref) => mentionPill(state, chat, ref).name);
}

const optionLines = (options: QuestionOption[]) =>
	options.map(
		(o) => `- ${o.label}${o.description ? ` — ${o.description}` : ""}`,
	);

function questionText(question: Question): string {
	if (question.kind === "form")
		return (question.parts ?? [])
			.map((part) => [part.title, ...optionLines(part.options)].join("\n"))
			.join("\n\n");
	const options =
		question.kind === "select" ? optionLines(question.options) : [];
	return [
		question.title,
		...(question.body ? ["", question.body] : []),
		...(options.length ? ["", ...options] : []),
	].join("\n");
}

/**
 * Who may delete a message for everyone, as the server decides it: its author, or the chat's owner. A 1:1 belongs to
 * its one person, so that covers their Dev's replies and Dev's notes there; a group's owner moderates the group
 * (its own Dev belongs to nobody, so otherwise nobody could take back what it said). A message still being sent
 * has nothing on the server to delete yet.
 */
export function canDeleteMessage(state: ChatState, message: Message): boolean {
	if (message.id.startsWith("local-")) return false;
	if (message.authorId !== null && message.authorId === state.meId) return true;
	return !!state.chats
		.find((c) => c.id === message.chatId)
		?.ownerIds.includes(state.meId);
}

/**
 * Whether the viewer may edit a message's words, as the server decides it: only their own, once it's sent, and only
 * plain text (a card is what it carries: a task, a sketch, a question, a file, a voice note, a call).
 */
export function canEditMessage(state: ChatState, message: Message): boolean {
	if (
		message.id.startsWith("local-") ||
		message.authorId === null ||
		message.authorId !== state.meId
	)
		return false;
	return (
		!message.taskId &&
		!message.appId &&
		!message.question &&
		!message.file &&
		!message.voice &&
		!message.call
	);
}

/** The viewer's latest message in a chat they may edit, for ↑ in an empty composer (as Slack's). */
export function lastEditableMessage(
	state: ChatState,
	chatId: string,
): Message | undefined {
	return lastMatch(
		state.messages,
		(m) => m.chatId === chatId && canEditMessage(state, m),
	);
}

/**
 * What the delete confirm adds: the task or saved sketch the message carried stays; a file it shares, or an unsaved
 * sketch no other message carries, goes with it (as the server deletes them).
 */
export function deleteMessageNote(
	state: ChatState,
	message: Message,
): string | null {
	const task = message.taskId
		? state.tasks.find((t) => t.id === message.taskId)
		: undefined;
	if (task) return `The task “${task.title}” stays.`;
	const app = message.appId
		? state.apps.find((a) => a.id === message.appId)
		: undefined;
	if (app) {
		const carriedElsewhere = state.messages.some(
			(m) => m.appId === app.id && m.id !== message.id,
		);
		return app.saved || carriedElsewhere
			? `The sketch ${app.name} stays.`
			: `The sketch ${app.name} is deleted too.`;
	}
	return message.file
		? `The file ${fileTitle(message.file)} is deleted too.`
		: null;
}
