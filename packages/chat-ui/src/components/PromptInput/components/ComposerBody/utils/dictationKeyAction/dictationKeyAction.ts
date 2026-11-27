type DictationKey = Pick<
	KeyboardEvent,
	"key" | "shiftKey" | "metaKey" | "ctrlKey" | "isComposing"
>;

/**
 * What a key does while dictation runs: Escape cancels, Enter stops or
 * retries. Only a bare Shift+Enter is left to the composer (it adds a line);
 * every other Enter chord is taken so none of them can send the draft.
 */
export function dictationKeyAction(
	event: DictationKey,
): "cancel" | "finish" | null {
	if (event.isComposing) return null;
	if (event.key === "Escape") return "cancel";
	if (event.key !== "Enter") return null;
	if (event.shiftKey && !event.metaKey && !event.ctrlKey) return null;
	return "finish";
}
