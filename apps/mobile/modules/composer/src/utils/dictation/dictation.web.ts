import type { Dictation, DictationErrorCode } from "./dictation.types";

interface SpeechRecognitionResultLike {
	isFinal: boolean;
	0: { transcript: string };
}

interface SpeechRecognitionLike {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onresult:
		| ((event: {
				resultIndex: number;
				results: ArrayLike<SpeechRecognitionResultLike>;
		  }) => void)
		| null;
	onerror: ((event: { error: string }) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
	abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const Recognition: SpeechRecognitionConstructor | undefined =
	typeof window === "undefined"
		? undefined
		: (((window as unknown as Record<string, unknown>).SpeechRecognition ??
				(window as unknown as Record<string, unknown>)
					.webkitSpeechRecognition) as
				| SpeechRecognitionConstructor
				| undefined);

const ERROR_CODES: Record<string, DictationErrorCode | null> = {
	"not-allowed": "permission",
	"service-not-allowed": "permission",
	"audio-capture": "permission",
	network: "network",
	"language-not-supported": "language",
	"no-speech": null,
	aborted: null,
};

export const dictation: Dictation = {
	available: Recognition !== undefined,
	start: async (listener) => {
		if (!Recognition) return null;
		const recognition = new Recognition();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = navigator.language;
		let listening = true;
		let failed = false;
		recognition.onresult = (event) => {
			let interim = "";
			for (
				let index = event.resultIndex;
				index < event.results.length;
				index++
			) {
				const result = event.results[index];
				if (!result) continue;
				const text = result[0].transcript.trim();
				if (result.isFinal) {
					if (text) listener.onFinal(text);
				} else {
					interim = interim ? `${interim} ${text}` : text;
				}
			}
			listener.onPartial(interim);
		};
		recognition.onerror = (event) => {
			const code = ERROR_CODES[event.error];
			if (code === null) return;
			failed = true;
			listening = false;
			listener.onError(code ?? "failed");
		};
		// Browsers end a session after a pause; keep going until stop.
		recognition.onend = () => {
			if (listening && !failed) {
				recognition.start();
				return;
			}
			listener.onEnd();
		};
		try {
			recognition.start();
		} catch {
			listener.onError("failed");
			return null;
		}
		return {
			stop: () => {
				listening = false;
				recognition.stop();
			},
			cancel: () => {
				listening = false;
				recognition.abort();
			},
		};
	},
};
