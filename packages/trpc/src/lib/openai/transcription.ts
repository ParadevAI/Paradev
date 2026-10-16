const TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

export interface TranscribeAudioInput {
	apiKey: string;
	model: string;
	audio: Uint8Array<ArrayBuffer>;
	/** OpenAI reads the container format from the extension. */
	fileName: string;
	mimeType: string;
	signal?: AbortSignal;
}

export class TranscriptionError extends Error {
	constructor(
		public readonly status: number,
		body: string,
	) {
		super(`OpenAI audio/transcriptions ${status}: ${body.slice(0, 300)}`);
		this.name = "TranscriptionError";
	}
}

export async function transcribeAudio(
	input: TranscribeAudioInput,
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	const form = new FormData();
	form.append("model", input.model);
	form.append("response_format", "json");
	form.append(
		"file",
		new File([input.audio], input.fileName, { type: input.mimeType }),
	);
	const response = await fetchImpl(TRANSCRIPTIONS_URL, {
		method: "POST",
		headers: { Authorization: `Bearer ${input.apiKey}` },
		body: form,
		signal: input.signal,
	});
	if (!response.ok) {
		throw new TranscriptionError(response.status, await response.text());
	}
	const body = (await response.json()) as { text?: unknown };
	if (typeof body.text !== "string") {
		throw new Error("OpenAI audio/transcriptions response is missing text");
	}
	return body.text.trim();
}
