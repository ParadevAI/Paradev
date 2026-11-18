export function rowElement(
	viewport: HTMLElement,
	messageId: string,
): Element | null {
	if (typeof CSS === "undefined" || typeof CSS.escape !== "function")
		return null;
	return viewport.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
}
