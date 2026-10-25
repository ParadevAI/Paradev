import { DICTATION_MAX_AUDIO_BYTES } from "@superset/shared/voice";
import { z } from "zod";

const AUDIO_EXTENSIONS = new Map([
	["audio/webm", "webm"],
	["audio/ogg", "ogg"],
	["audio/mp4", "mp4"],
	["audio/x-m4a", "m4a"],
	["audio/mpeg", "mp3"],
	["audio/wav", "wav"],
	["audio/x-wav", "wav"],
	["audio/flac", "flac"],
]);

/** MediaRecorder reports types with codec parameters, e.g. `audio/webm;codecs=opus`. */
export function dictationAudioExtension(mimeType: string): string | null {
	const baseType = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
	return AUDIO_EXTENSIONS.get(baseType) ?? null;
}

export const transcribeSchema = z.object({
	audio: z
		.base64()
		.min(1)
		.max(Math.ceil(DICTATION_MAX_AUDIO_BYTES / 3) * 4),
	mimeType: z
		.string()
		.max(255)
		.refine((value) => dictationAudioExtension(value) !== null, {
			message: "Unsupported audio format",
		}),
});

export type TranscribeInput = z.infer<typeof transcribeSchema>;
