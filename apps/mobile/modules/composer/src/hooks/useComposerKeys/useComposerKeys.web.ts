import type { KeyboardEvent } from "react";
import type { UseComposerKeys } from "./useComposerKeys.types";

/** Enter sends and Shift+Enter breaks the line, unless a touch keyboard is typing. */
export const useComposerKeys: UseComposerKeys =
	({ onSubmit, onDismiss }) =>
	(event) => {
		const key = event as unknown as KeyboardEvent<HTMLTextAreaElement>;
		if (key.key === "Escape") {
			key.preventDefault();
			onDismiss();
			return;
		}
		if (key.key !== "Enter" || key.shiftKey || key.altKey) return;
		if (key.nativeEvent.isComposing || key.nativeEvent.keyCode === 229) return;
		const modified = key.metaKey || key.ctrlKey;
		if (!modified && window.matchMedia("(pointer: coarse)").matches) return;
		key.preventDefault();
		onSubmit();
	};
