export type DictationErrorCode =
	| "permission"
	| "network"
	| "busy"
	| "language"
	| "failed";

export interface DictationListener {
	/** The words heard since the last final result; replaced on each call. */
	onPartial: (text: string) => void;
	/** A finished stretch of speech, to keep. */
	onFinal: (text: string) => void;
	/** 0–1, roughly ten times a second while listening. */
	onLevel: (level: number) => void;
	onError: (code: DictationErrorCode) => void;
	/** Fires once, after stop, cancel or an error. */
	onEnd: () => void;
}

export interface DictationSession {
	/** Stops listening; the last words still arrive before `onEnd`. */
	stop: () => void;
	cancel: () => void;
}

export interface Dictation {
	/** False hides the mic: there is no recogniser on this platform. */
	available: boolean;
	/** Asks for the microphone first. Null when it was not allowed or did not start. */
	start: (listener: DictationListener) => Promise<DictationSession | null>;
}
