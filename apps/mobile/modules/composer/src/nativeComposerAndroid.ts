import { requireNativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";
import type { ComposerPastedItem } from "./Composer.types";
import type { DictationErrorCode } from "./utils/dictation/dictation.types";

interface ComposerAndroidEvents {
	onDictationPartial: (event: { text: string }) => void;
	onDictationFinal: (event: { text: string }) => void;
	onDictationLevel: (event: { level: number }) => void;
	onDictationError: (event: { code: DictationErrorCode }) => void;
	onDictationEnd: () => void;
	onClipboardChange: (event: { hasAttachments: boolean }) => void;
}

interface ComposerAndroidModule {
	isDictationAvailable(): boolean;
	requestMicrophonePermission(): Promise<{ granted: boolean }>;
	startDictation(locale: string | null): Promise<void>;
	stopDictation(): Promise<void>;
	cancelDictation(): Promise<void>;
	clipboardHasAttachments(): boolean;
	readClipboardAttachments(): Promise<ComposerPastedItem[]>;
	documentThumbnail(uri: string, sidePx: number): Promise<string | null>;
	addListener<E extends keyof ComposerAndroidEvents>(
		event: E,
		listener: ComposerAndroidEvents[E],
	): EventSubscription;
}

/** `modules/composer-android`: Android only, so only `.android` files import it. */
export const ComposerAndroid =
	requireNativeModule<ComposerAndroidModule>("ComposerAndroid");
