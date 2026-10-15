import { isImeComposing } from "@superset/ui/lib/keyboard";

export function isCloseShortcut(event: KeyboardEvent): boolean {
	if (event.key !== "Escape") return false;
	if (event.repeat || event.defaultPrevented) return false;
	if (isImeComposing(event)) return false;
	return !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey);
}
