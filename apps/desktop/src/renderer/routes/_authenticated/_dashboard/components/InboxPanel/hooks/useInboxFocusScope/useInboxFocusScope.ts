import { type RefObject, useEffect, useRef } from "react";
import { useHotkeyScopeStore } from "renderer/hotkeys";
import { getDispatchChord } from "renderer/hotkeys/hooks/useBinding";
import type { HotkeyId } from "renderer/hotkeys/registry";
import { isTextEntryTarget } from "renderer/hotkeys/utils/scope";
import { canonicalizeChord, eventToChord } from "shared/hotkey-chord";

const LIST_KEYS: HotkeyId[] = [
	"INBOX_NEXT",
	"INBOX_PREVIOUS",
	"INBOX_ARCHIVE",
	"INBOX_OPEN_SOURCE",
];

const CARD_PANE = "[data-inbox-scope], [role='alertdialog']";

/**
 * The inbox's keys act while the panel is open and the reader looks at the
 * inbox: a card is shown beside it, or the panel was the last thing opened or
 * clicked. Keyboard focus need not be in the list, and a caret in a card's own
 * composer keeps them. A caret in a terminal, or in a field or editor of any
 * other surface, keeps every key for that surface.
 */
export function useInboxFocusScope(
	panel: RefObject<HTMLElement | null>,
	isOpen: boolean,
	showsCard: boolean,
) {
	const lastInPanel = useRef(false);

	useEffect(() => {
		lastInPanel.current = isOpen;
		if (!isOpen) return;
		const frame = requestAnimationFrame(() =>
			panel.current?.focus({ preventScroll: true }),
		);
		return () => cancelAnimationFrame(frame);
	}, [isOpen, panel]);

	useEffect(() => {
		const { enter, leave } = useHotkeyScopeStore.getState();
		if (!isOpen) {
			leave("inbox");
			return;
		}
		const typesElsewhere = () => {
			const active = document.activeElement;
			return (
				isTextEntryTarget(active) &&
				active?.closest(CARD_PANE) === null &&
				panel.current?.contains(active) !== true
			);
		};
		const sync = () => {
			if (!typesElsewhere() && (showsCard || lastInPanel.current))
				enter("inbox");
			else leave("inbox");
		};
		const onPointerDown = (event: PointerEvent) => {
			lastInPanel.current =
				event.target instanceof Node &&
				panel.current?.contains(event.target) === true;
			sync();
		};
		const onFocusOut = () => setTimeout(sync, 0);
		// An editor binds some of the same chords (insert a link, inline code). In a card's composer the inbox's key wins: the editor never sees it.
		const onKeyDown = (event: KeyboardEvent) => {
			if (!isTextEntryTarget(event.target)) return;
			if (useHotkeyScopeStore.getState().active !== "inbox") return;
			const chord = eventToChord(event);
			const listKey = LIST_KEYS.some((id) => {
				const bound = getDispatchChord(id);
				return bound !== null && canonicalizeChord(bound) === chord;
			});
			if (!chord || !listKey) return;
			event.stopPropagation();
			event.preventDefault();
			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: event.key,
					code: event.code,
					metaKey: event.metaKey,
					ctrlKey: event.ctrlKey,
					shiftKey: event.shiftKey,
					altKey: event.altKey,
					bubbles: true,
				}),
			);
		};
		sync();
		document.addEventListener("focusin", sync);
		document.addEventListener("focusout", onFocusOut);
		document.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			document.removeEventListener("focusin", sync);
			document.removeEventListener("focusout", onFocusOut);
			document.removeEventListener("pointerdown", onPointerDown, true);
			leave("inbox");
		};
	}, [isOpen, showsCard, panel]);
}
