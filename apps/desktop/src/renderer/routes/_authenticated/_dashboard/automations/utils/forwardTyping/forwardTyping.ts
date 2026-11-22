import type { KeyboardEvent, RefObject } from "react";

/**
 * Sends a printable key to the field when focus sits on a menu item, which
 * Radix moves there on every pointer move, instead of the menu's
 * jump-to-letter.
 */
export function forwardTyping(
	inputRef: RefObject<HTMLInputElement | null>,
	event: KeyboardEvent<HTMLElement>,
) {
	const input = inputRef.current;
	if (
		!input ||
		event.target === input ||
		event.key.length !== 1 ||
		event.metaKey ||
		event.ctrlKey
	) {
		return;
	}
	event.stopPropagation();
	input.focus();
}
