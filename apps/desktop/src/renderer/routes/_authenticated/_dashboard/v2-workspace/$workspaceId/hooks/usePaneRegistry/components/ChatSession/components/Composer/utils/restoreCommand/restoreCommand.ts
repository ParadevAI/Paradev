import type { PromptInputHandle } from "@superset/chat-ui/PromptInput";
import type { RefObject } from "react";

/**
 * Puts a command that failed back in the composer, unless the user has
 * started a new message: then `offer` gets a callback to add it on request.
 */
export function restoreCommand(
	inputRef: RefObject<Pick<PromptInputHandle, "appendText" | "isEmpty"> | null>,
	command: string,
	offer: (restore: () => void) => void,
): void {
	if (inputRef.current?.isEmpty()) {
		inputRef.current.appendText(command);
		return;
	}
	offer(() => inputRef.current?.appendText(command));
}
