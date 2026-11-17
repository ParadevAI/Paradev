import type { SharedFileResult } from "../api-types/api-types.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";

export interface ChatFileUpload {
	groupId: string;
	name: string;
	size: number;
	/** The bytes from `start` up to `end` (exclusive) of the file, as part `index`: read only what's sent, not the whole file at once. */
	readPart(index: number, start: number, end: number): Promise<Uint8Array>;
	/** Hex SHA-256 of the whole file, which the API checks the parts against (the app computes it: expo-crypto, crypto.subtle). */
	sha256: string;
	/** The caption, posted with the file's card. */
	message?: string;
	clientId?: string;
	/** Set when the file is a voice note's recording: its length and waveform. The server transcribes it. */
	/** `text`: its words, transcribed on the device as it was recorded; without it the server transcribes the file. */
	voice?: { durationMs: number; waveform: number[]; text?: string };
	/** Bytes sent so far, after each part. */
	onProgress?(sent: number, total: number): void;
}

/** Shares a file in a chat from the composer: opens the upload, sends its parts in order, then posts its card. */
export async function uploadChatFile(
	api: Pick<SyncApi, "beginFileUpload" | "putFilePart" | "finishFileUpload">,
	input: ChatFileUpload,
): Promise<SharedFileResult> {
	const { groupId, name, size } = input;
	const upload = await api.beginFileUpload(groupId, { name, size });
	for (let index = 0; index < upload.parts; index++) {
		const start = index * upload.partBytes;
		const end = Math.min(size, start + upload.partBytes);
		await api.putFilePart(
			groupId,
			upload.uploadId,
			index,
			await input.readPart(index, start, end),
		);
		input.onProgress?.(end, size);
	}
	return api.finishFileUpload(groupId, {
		uploadId: upload.uploadId,
		name,
		size,
		sha256: input.sha256,
		message: input.message,
		clientId: input.clientId,
		voice: input.voice,
	});
}
