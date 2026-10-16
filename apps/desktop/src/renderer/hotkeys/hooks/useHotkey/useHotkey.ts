import { useRef } from "react";
import { type Options, useHotkeys } from "react-hotkeys-hook";
import { formatHotkeyDisplay } from "../../display";
import type { HotkeyId } from "../../registry";
import { HOTKEYS, PLATFORM } from "../../registry";
import { useHotkeyScopeStore } from "../../stores/hotkeyScopeStore";
import { useEffectiveLayoutMap } from "../../stores/keyboardPreferencesStore";
import type { HotkeyDisplay } from "../../types";
import { bindingToDispatchChord } from "../../utils/binding";
import { isSilencedByScope } from "../../utils/scope";
import { getDispatchChord, useBinding } from "../useBinding";

// react-hotkeys-hook doesn't check AltGraph or IME composition. Use its
// `ignoreEventWhen` option (runs after match, before preventDefault) to
// suppress those events so AltGr-typed printables and IME keystrokes pass
// through to the focused element.
function shouldIgnoreEvent(e: KeyboardEvent): boolean {
	if (e.isComposing || e.keyCode === 229) return true;
	if (e.getModifierState?.("AltGraph") === true) return true;
	return false;
}

export function useHotkey(
	id: HotkeyId,
	callback: (e: KeyboardEvent) => void,
	options?: Options,
): HotkeyDisplay {
	const binding = useBinding(id);
	const layoutMap = useEffectiveLayoutMap();
	const chord = bindingToDispatchChord(binding, layoutMap);
	const callbackRef = useRef(callback);
	callbackRef.current = callback;
	const callerIgnore = options?.ignoreEventWhen;
	const scope = HOTKEYS[id]?.scope;
	const silenced = () =>
		isSilencedByScope({
			hotkey: { scope, chord },
			active: useHotkeyScopeStore.getState().active,
			all: (Object.keys(HOTKEYS) as HotkeyId[])
				.filter((other) => HOTKEYS[other].scope)
				.map((other) => ({
					scope: HOTKEYS[other].scope,
					chord: getDispatchChord(other),
				})),
		});
	useHotkeys(
		chord ?? "",
		(e, _h) => {
			if (options?.preventDefault !== false) {
				e.preventDefault();
			}
			callbackRef.current(e);
		},
		{
			enableOnFormTags: true,
			enableOnContentEditable: true,
			...options,
			ignoreEventWhen: (e) =>
				shouldIgnoreEvent(e) || silenced() || (callerIgnore?.(e) ?? false),
		},
		[chord],
	);
	return formatHotkeyDisplay(chord, PLATFORM, layoutMap);
}
