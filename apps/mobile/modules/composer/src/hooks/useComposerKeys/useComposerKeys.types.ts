import type { TextInputKeyPressEvent } from "react-native";

export interface ComposerKeysOptions {
	onSubmit: () => void;
	onDismiss: () => void;
}

export type ComposerKeyPress = (event: TextInputKeyPressEvent) => void;

export type UseComposerKeys = (
	options: ComposerKeysOptions,
) => ComposerKeyPress | undefined;
