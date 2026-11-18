import type { KeyboardEvent } from "react";

export function escapeBack(goBack: (() => void) | undefined) {
	return (event: KeyboardEvent<HTMLElement>) => {
		if (!goBack || event.key !== "Escape" || event.defaultPrevented) return;
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
			return;
		if (event.nativeEvent.isComposing) return;
		if (
			!(event.target instanceof Node) ||
			!event.currentTarget.contains(event.target)
		)
			return;
		event.preventDefault();
		goBack();
	};
}
