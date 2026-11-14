import { requireOptionalNativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";
import type {
	VoiceAudioApi,
	VoiceInterruptionEvent,
	VoiceRouteChangeEvent,
} from "./VoiceAudio.types";

interface VoiceAudioNativeModule {
	configure(): Promise<void>;
	preferSpeaker(on: boolean): Promise<void>;
	release(): Promise<void>;
	currentRoute(): string[];
	addListener(
		event: "onInterruption",
		listener: (event: VoiceInterruptionEvent) => void,
	): EventSubscription;
	addListener(
		event: "onRouteChange",
		listener: (event: VoiceRouteChangeEvent) => void,
	): EventSubscription;
}

// Optional: a shell built before this module runs voice over WebRTC's own
// session, on the receiver, rather than not at all.
const native =
	requireOptionalNativeModule<VoiceAudioNativeModule>("VoiceAudio");

export const VoiceAudio: VoiceAudioApi = {
	available: native !== null,
	configure: () => native?.configure() ?? Promise.resolve(),
	preferSpeaker: (on) => native?.preferSpeaker(on) ?? Promise.resolve(),
	release: () => native?.release() ?? Promise.resolve(),
	currentRoute: () => native?.currentRoute() ?? [],
	onInterruption: (listener) =>
		native?.addListener("onInterruption", listener) ?? null,
	onRouteChange: (listener) =>
		native?.addListener("onRouteChange", listener) ?? null,
};
