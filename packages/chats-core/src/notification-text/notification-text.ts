import { plainText } from "../plain-text/plain-text.ts";
import { voiceDuration } from "../voice-notes/voice-notes.ts";

/** What a new message's notification is about; the server and the Mac app fill it from what they know. */
export interface NotificationSource {
	/** The person or Dev who wrote it; null for Dev's own notes. */
	senderName: string | null;
	chatTitle: string;
	/** A 1:1 is titled by the sender alone; a group by sender and chat. */
	isGroup: boolean;
	text: string;
	taskTitle?: string | null;
	appName?: string | null;
	questionTitle?: string | null;
	/** A shared file's title or name, for a file card without a caption. */
	fileName?: string | null;
	/** A voice note's length: its line is what was said, or "Voice note (0:06)" until that's known. */
	voiceMs?: number | null;
}

export interface NotificationText {
	title: string;
	body: string;
}

/** Lock screens show about two lines; longer bodies only cost bytes in the push payload. */
export const NOTIFICATION_BODY_MAX = 180;

/** A message's notification: "Nina · Trip" over its text with markdown taken out, or a card's one line. */
export function notificationText(source: NotificationSource): NotificationText {
	const sender = source.senderName ?? "Dev";
	const title = source.isGroup
		? `${sender} · ${source.chatTitle}`
		: (source.senderName ?? source.chatTitle);
	return { title, body: cutLine(messageLine(source), NOTIFICATION_BODY_MAX) };
}

/** What a message says as one line of plain text: its words, or its card's line ("Task: Pay rent", "File: menu.pdf"). */
export function messageLine(
	source: Omit<NotificationSource, "senderName" | "chatTitle" | "isGroup">,
): string {
	if (source.questionTitle) return `Asks: ${plainText(source.questionTitle)}`;
	if (source.taskTitle) return `Task: ${plainText(source.taskTitle)}`;
	if (source.appName) return `Sketch: ${source.appName}`;
	const text = plainText(source.text);
	if (source.voiceMs != null)
		return `🎤 ${text || `Voice note (${voiceDuration(source.voiceMs)})`}`;
	if (!text && source.fileName) return `File: ${source.fileName}`;
	return text;
}

/** Cut to `max` characters, the last of them an ellipsis. */
export function cutLine(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1).trimEnd()}…`;
}
