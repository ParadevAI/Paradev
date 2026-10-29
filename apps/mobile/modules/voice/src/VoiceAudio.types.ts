export interface VoiceInterruptionEvent {
	phase: "began" | "ended";
	shouldResume: boolean;
}

export interface VoiceRouteChangeEvent {
	reason: string;
	outputs: string[];
}

export interface VoiceSubscription {
	remove(): void;
}

/** The app's audio session for a voice call. */
export interface VoiceAudioApi {
	/** False when voice runs on WebRTC's own session instead. */
	available: boolean;
	configure(): Promise<void>;
	preferSpeaker(on: boolean): Promise<void>;
	release(): Promise<void>;
	currentRoute(): string[];
	onInterruption(
		listener: (event: VoiceInterruptionEvent) => void,
	): VoiceSubscription | null;
	onRouteChange(
		listener: (event: VoiceRouteChangeEvent) => void,
	): VoiceSubscription | null;
}
