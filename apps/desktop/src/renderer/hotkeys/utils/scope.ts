import type { HotkeyScope } from "../types";

interface ScopedChord {
	scope: HotkeyScope | undefined;
	chord: string | null;
}

/** True when the key event's target takes typed text: a field, an editor, or a terminal's input. Arrow keys belong to it then. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
	const element = target as Partial<HTMLElement> | null;
	if (!element?.tagName) return false;
	return (
		element.isContentEditable === true ||
		["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)
	);
}

/**
 * Whether a hotkey must stay silent for this press. A scoped hotkey acts only
 * while its scope holds focus. An unscoped one gives way when the focused
 * scope binds the same chord, and behaves as before everywhere else.
 */
export function isSilencedByScope({
	hotkey,
	active,
	all,
}: {
	hotkey: ScopedChord;
	active: HotkeyScope | null;
	all: ScopedChord[];
}): boolean {
	if (hotkey.scope) return hotkey.scope !== active;
	if (!active || !hotkey.chord) return false;
	return all.some(
		(other) => other.scope === active && other.chord === hotkey.chord,
	);
}
