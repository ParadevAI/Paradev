import type { PromptInputHandle } from "@superset/chat-ui/PromptInput";
import type { RefObject } from "react";

/**
 * Puts a command that failed back in the composer, unless the user has
 * started a new message: then `offer` gets a callback to add it on request.
 */
export function restoreCommand(
	inputRef: RefObject<Pick<
		PromptInputHandle,
		"restoreDraft" | "isEmpty"
	> | null>,
	command: string,
	offer: (restore: () => void) => void,
): void {
	const restore = () =>
		inputRef.current?.restoreDraft({
			segments: [{ type: "text", text: command }],
			attachments: [],
		});
	if (inputRef.current?.isEmpty()) {
		restore();
		return;
	}
	offer(restore);
}
