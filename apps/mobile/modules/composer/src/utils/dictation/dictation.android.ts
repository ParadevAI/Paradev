import { ComposerAndroid } from "../../nativeComposerAndroid";
import type { Dictation } from "./dictation.types";

export const dictation: Dictation = {
	available: ComposerAndroid.isDictationAvailable(),
	start: async (listener) => {
		const permission = await ComposerAndroid.requestMicrophonePermission();
		if (!permission.granted) {
			listener.onError("permission");
			return null;
		}
		const subscriptions = [
			ComposerAndroid.addListener("onDictationPartial", ({ text }) =>
				listener.onPartial(text),
			),
			ComposerAndroid.addListener("onDictationFinal", ({ text }) =>
				listener.onFinal(text),
			),
			ComposerAndroid.addListener("onDictationLevel", ({ level }) =>
				listener.onLevel(level),
			),
			ComposerAndroid.addListener("onDictationError", ({ code }) =>
				listener.onError(code),
			),
			ComposerAndroid.addListener("onDictationEnd", () => {
				for (const subscription of subscriptions) subscription.remove();
				listener.onEnd();
			}),
		];
		try {
			await ComposerAndroid.startDictation(null);
		} catch {
			for (const subscription of subscriptions) subscription.remove();
			listener.onError("failed");
			return null;
		}
		return {
			stop: () => void ComposerAndroid.stopDictation(),
			cancel: () => void ComposerAndroid.cancelDictation(),
		};
	},
};
