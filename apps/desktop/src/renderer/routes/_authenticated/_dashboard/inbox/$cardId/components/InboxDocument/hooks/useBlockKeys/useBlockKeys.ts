import { useHotkey } from "renderer/hotkeys/hooks/useHotkey";
import type { HotkeyId } from "renderer/hotkeys/registry";
import { isTextEntryTarget } from "renderer/hotkeys/utils/scope";
import type { ActionKeySlot } from "../../components/CardBlock/utils/assignActionKeys";

const NUMBERED: [HotkeyId, ActionKeySlot][] = [
	["INBOX_BLOCK_ACTION_1", "1"],
	["INBOX_BLOCK_ACTION_2", "2"],
	["INBOX_BLOCK_ACTION_3", "3"],
	["INBOX_BLOCK_ACTION_4", "4"],
	["INBOX_BLOCK_ACTION_5", "5"],
	["INBOX_BLOCK_ACTION_6", "6"],
	["INBOX_BLOCK_ACTION_7", "7"],
	["INBOX_BLOCK_ACTION_8", "8"],
	["INBOX_BLOCK_ACTION_9", "9"],
];

/** Presses the control of the focused block that answers to a key, or an open confirmation's own button. A control that is off stays off. */
function press(slot: ActionKeySlot) {
	const confirm =
		slot === "primary"
			? document.querySelector<HTMLElement>(
					"[role='alertdialog'] [data-slot='alert-dialog-action']",
				)
			: null;
	const control =
		confirm ??
		document.querySelector<HTMLElement>(
			`[data-focus-block][data-focused="true"] [data-action-key="${slot}"]`,
		);
	if (control && !(control as HTMLButtonElement).disabled) control.click();
}

const TABBABLE =
	"a[href], button, input, select, textarea, [contenteditable='true'], [tabindex]";

function tabStops(frame: Element): HTMLElement[] {
	return [...frame.querySelectorAll<HTMLElement>(TABBABLE)].filter(
		(element) =>
			element.tabIndex >= 0 &&
			!(element as HTMLButtonElement).disabled &&
			element.getClientRects().length > 0,
	);
}

function focusedFrame(): Element | null {
	return document.querySelector('[data-focus-block][data-focused="true"]');
}

/** Puts keyboard focus on the first or last field of the block that has the card's focus. */
export function enterFocusedBlock(end: "first" | "last") {
	const frame = focusedFrame();
	if (!frame) return;
	const stops = tabStops(frame);
	(end === "first" ? stops[0] : stops[stops.length - 1])?.focus();
}

/**
 * Tab walks the focused block's own fields. From its last field it goes to
 * the next open block, and Shift+Tab from its first field to the previous
 * one; with no block that way it wraps inside the block, so Tab never leaves
 * the card. An editor that used the key (a list indent) keeps it.
 */
function tab(
	event: KeyboardEvent,
	step: 1 | -1,
	onStep: (step: 1 | -1) => boolean,
) {
	const frame = focusedFrame();
	if (!frame || document.querySelector("[role='alertdialog']")) return;
	const stops = tabStops(frame);
	const at = stops.findIndex(
		(stop) =>
			stop === document.activeElement || stop.contains(document.activeElement),
	);
	const edge = step === 1 ? stops.length - 1 : 0;
	if (at !== -1 && at !== edge) return;
	event.preventDefault();
	const active = document.activeElement;
	if (at === -1 && (active === frame || !frame.contains(active))) {
		enterFocusedBlock(step === 1 ? "first" : "last");
		return;
	}
	if (!onStep(step)) enterFocusedBlock(step === 1 ? "first" : "last");
}

/**
 * The keys of the focused block: its primary action, its "no", its numbered
 * actions, and Tab to its fields and on to the next or previous open block.
 * The "no" key stays with a field that has text, where it deletes a line.
 */
export function useBlockKeys({
	enabled,
	onStep,
}: {
	enabled: boolean;
	/** Moves the card's focus one open block on; false when there is none that way. */
	onStep: (step: 1 | -1) => boolean;
}) {
	const inText = (event: KeyboardEvent) => {
		if (!isTextEntryTarget(event.target)) return false;
		const field = event.target as HTMLInputElement;
		return (field.value ?? field.textContent ?? "") !== "";
	};
	const used = (event: KeyboardEvent) => event.defaultPrevented;
	useHotkey("INBOX_BLOCK_PRIMARY", () => press("primary"), {
		enabled,
		ignoreEventWhen: used,
	});
	useHotkey("INBOX_BLOCK_DISMISS", () => press("dismiss"), {
		enabled,
		ignoreEventWhen: inText,
	});
	useHotkey("INBOX_BLOCK_NEXT", (event) => tab(event, 1, onStep), {
		enabled,
		preventDefault: false,
		ignoreEventWhen: used,
	});
	useHotkey("INBOX_BLOCK_PREVIOUS", (event) => tab(event, -1, onStep), {
		enabled,
		preventDefault: false,
		ignoreEventWhen: used,
	});
	for (const [id, slot] of NUMBERED) {
		// biome-ignore lint/correctness/useHookAtTopLevel: a fixed list, the same nine hooks on every render
		useHotkey(id, () => press(slot), { enabled });
	}
}
