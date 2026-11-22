type ZoomKeyEvent = Pick<
	KeyboardEvent,
	"key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "isComposing"
> & { getModifierState?: KeyboardEvent["getModifierState"] };

/**
 * Cmd/Ctrl with the key that types "+" or numpad +. The ZOOM_IN binding is
 * Cmd/Ctrl+=, and layouts such as German QWERTZ have no unshifted "=" key.
 */
export function isPlusKeyZoomIn(event: ZoomKeyEvent, isMac: boolean): boolean {
	if (event.isComposing || event.getModifierState?.("AltGraph")) return false;
	if (event.altKey) return false;
	const modifier = isMac
		? event.metaKey && !event.ctrlKey
		: event.ctrlKey && !event.metaKey;
	if (!modifier) return false;
	return event.key === "+" || event.code === "NumpadAdd";
}
