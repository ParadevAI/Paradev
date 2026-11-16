import type { ChatState, MessageUpload } from "@superset/chats-core";
import { applySentMessage } from "../apply-event/apply-event.ts";
import {
	type ChatFileUpload,
	uploadChatFile,
} from "../chat-file-upload/chat-file-upload.ts";
import { ApiError } from "../http/http.ts";
import {
	newClientId,
	rollbackSend,
	sendFileOptimistic,
	setUpload,
	setVoiceWords,
} from "../optimistic/optimistic.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";

/** A file or voice note to send from the composer, as its bubble shows it at once. */
export interface FileSend {
	chatId: string;
	name: string;
	size: number;
	caption?: string;
	/** Set for a voice note: its length and waveform, drawn before anything has gone up. */
	voice?: { durationMs: number; waveform: number[] };
	/** This device's copy of the file (a picture's), drawn in its bubble instead of the shared file's link. */
	localUri?: string;
	/** Hashes the file and reads its parts; read again on a retry. */
	read(): Promise<FileSendContent>;
	/** Once it's sent, or dropped after failing (the phone deletes its recording then; the Mac lets go of a dropped picture). */
	onDone?(outcome: "sent" | "dropped"): void;
}

export interface FileSendContent {
	/** Hex SHA-256 of the whole file. */
	sha256: string;
	readPart: ChatFileUpload["readPart"];
	/** Its size as read, where the one it was sent with was only a guess (a recording just closed). */
	size?: number;
	/** A voice note's words, as the device heard them; without them the server transcribes the recording. */
	words?: string;
}

export interface FileSends {
	/** Shows the file's bubble at once and sends it; returns its clientId. */
	send(input: FileSend): string;
	/** Sends a failed one again, with the same clientId, so a file the server did get isn't posted twice. */
	retry(clientId: string): void;
	/** Drops a failed one from the thread. */
	discard(clientId: string): void;
}

interface Deps {
	api: Pick<SyncApi, "beginFileUpload" | "putFilePart" | "finishFileUpload">;
	update: (change: (s: ChatState) => ChatState) => void;
	now?: () => Date;
}

/** Why a send failed, in words for its bubble: the server's own for a refusal it explains, else the connection. */
export function uploadError(err: unknown): string {
	if (
		err instanceof ApiError &&
		err.status >= 400 &&
		err.status < 500 &&
		err.status !== 401
	)
		return err.message;
	return "Couldn't send. Check your connection and try again.";
}

/**
 * How full a sending file's bar is, 0 to 1: never quite empty, so a file still being read shows it has started, and
 * never full until the server has it (the last part lands before the card is posted).
 */
export function uploadFraction({ sent, total }: MessageUpload): number {
	const done = total > 0 ? sent / total : 0;
	return Math.min(0.95, Math.max(0.05, done));
}

/**
 * Files and voice notes, sent as WhatsApp sends them: the bubble shows at once (core's `Message.upload`, its progress
 * by parts), the server's copy takes its place by clientId (the same row), and a failure stays in the thread with its
 * reason, to retry or drop, rather than vanishing.
 */
export function createFileSends({
	api,
	update,
	now = () => new Date(),
}: Deps): FileSends {
	/** Each send not yet confirmed, kept for a retry. */
	const held = new Map<string, FileSend>();
	/** Those going up or waiting their turn. */
	const running = new Set<string>();
	/** The end of each chat's line: its files go one at a time, so they post in the order they were sent. */
	const lines = new Map<string, Promise<void>>();

	function enqueue(clientId: string, input: FileSend) {
		running.add(clientId);
		const ahead = lines.get(input.chatId);
		const line: Promise<void> = (
			ahead ? ahead.then(() => run(clientId, input)) : run(clientId, input)
		).then(() => {
			if (lines.get(input.chatId) === line) lines.delete(input.chatId);
		});
		lines.set(input.chatId, line);
	}

	async function run(clientId: string, input: FileSend) {
		try {
			const content = await input.read();
			if (input.voice && content.words)
				update((s) => setVoiceWords(s, clientId, content.words!));
			const sent = await uploadChatFile(api, {
				groupId: input.chatId,
				name: input.name,
				size: content.size ?? input.size,
				sha256: content.sha256,
				readPart: content.readPart,
				clientId,
				...(input.caption?.trim() ? { message: input.caption } : {}),
				...(input.voice
					? {
							voice: {
								...input.voice,
								...(content.words ? { text: content.words } : {}),
							},
						}
					: {}),
				onProgress: (sent, total) =>
					update((s) => setUpload(s, clientId, { sent, total })),
			});
			held.delete(clientId);
			update((s) => applySentMessage(s, { message: sent.message, task: null }));
			input.onDone?.("sent");
		} catch (err) {
			update((s) =>
				setUpload(s, clientId, {
					sent: 0,
					total: input.size,
					error: uploadError(err),
				}),
			);
		} finally {
			running.delete(clientId);
		}
	}

	return {
		send(input) {
			const clientId = newClientId();
			held.set(clientId, input);
			update((s) => sendFileOptimistic(s, { ...input, clientId, now: now() }));
			enqueue(clientId, input);
			return clientId;
		},
		retry(clientId) {
			const input = held.get(clientId);
			if (!input || running.has(clientId)) return;
			update((s) => setUpload(s, clientId, { sent: 0, total: input.size }));
			enqueue(clientId, input);
		},
		discard(clientId) {
			if (running.has(clientId)) return;
			const input = held.get(clientId);
			held.delete(clientId);
			update((s) => rollbackSend(s, clientId));
			input?.onDone?.("dropped");
		},
	};
}
