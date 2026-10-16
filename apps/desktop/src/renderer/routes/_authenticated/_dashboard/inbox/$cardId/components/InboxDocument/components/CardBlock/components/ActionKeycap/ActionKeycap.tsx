import { cn } from "@superset/ui/utils";
import { useHotkeyDisplay } from "renderer/hotkeys/hooks/useHotkeyDisplay";
import type { HotkeyId } from "renderer/hotkeys/registry";
import type { ActionKeySlot } from "../../utils/assignActionKeys";

const HOTKEY: Record<ActionKeySlot, HotkeyId> = {
	primary: "INBOX_BLOCK_PRIMARY",
	dismiss: "INBOX_BLOCK_DISMISS",
	"1": "INBOX_BLOCK_ACTION_1",
	"2": "INBOX_BLOCK_ACTION_2",
	"3": "INBOX_BLOCK_ACTION_3",
	"4": "INBOX_BLOCK_ACTION_4",
	"5": "INBOX_BLOCK_ACTION_5",
	"6": "INBOX_BLOCK_ACTION_6",
	"7": "INBOX_BLOCK_ACTION_7",
	"8": "INBOX_BLOCK_ACTION_8",
	"9": "INBOX_BLOCK_ACTION_9",
};

interface ActionKeycapProps {
	/** Absent draws nothing: the button's block does not have focus. */
	slot: ActionKeySlot | undefined;
	className?: string;
}

/** The key a button answers to, drawn on the button. */
export function ActionKeycap({ slot, className }: ActionKeycapProps) {
	const { text } = useHotkeyDisplay(slot ? HOTKEY[slot] : "");
	if (!slot || !text) return null;
	return (
		<kbd
			className={cn(
				"ml-1.5 shrink-0 rounded border border-current/25 px-1 font-sans text-[10px] leading-4 font-medium opacity-70",
				className,
			)}
		>
			{text}
		</kbd>
	);
}
