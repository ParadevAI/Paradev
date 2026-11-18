import type { VoiceAudioApi } from "./VoiceAudio.types";

export const VoiceAudio: VoiceAudioApi = {
	available: false,
	configure: () => Promise.resolve(),
	preferSpeaker: () => Promise.resolve(),
	release: () => Promise.resolve(),
	currentRoute: () => [],
	onInterruption: () => null,
	onRouteChange: () => null,
};
