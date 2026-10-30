import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { type RefObject, useState } from "react";

/**
 * A Dialog opened synchronously from the same click that's dismissing
 * something else (a DropdownMenuItem select, a toast action) gets caught by
 * that other element's own close cycle and immediately dismisses itself (a
 * well-known Radix issue): the closing element's exit animation (~150ms) is
 * still running, and its eventual focus-restore reads as a focus/pointer-
 * outside on the just-opened dialog. Waiting out the exit animation before
 * opening the dialog avoids the race.
 */
export const MENU_CLOSE_ANIMATION_MS = 200;

/**
 * Extension state for a pane's More menu. Pinned extensions become its first
 * rows when the toolbar is too narrow to show their buttons; the buttons'
 * container query is the one source of truth, read when the menu opens.
 */
export function useBrowserExtensionsMenu(
	pinnedButtonsRef: RefObject<HTMLElement | null>,
) {
	const [pinnedInMenu, setPinnedInMenu] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<BrowserExtension | null>(
		null,
	);
	const [isRemoveOpen, setIsRemoveOpen] = useState(false);

	return {
		pinnedInMenu,
		removeTarget,
		isRemoveOpen,
		setIsRemoveOpen,
		onMenuOpenChange(open: boolean) {
			if (!open) return;
			const buttons = pinnedButtonsRef.current;
			setPinnedInMenu(!buttons || getComputedStyle(buttons).display === "none");
		},
		requestRemove(extension: BrowserExtension) {
			setTimeout(() => {
				setRemoveTarget(extension);
				setIsRemoveOpen(true);
			}, MENU_CLOSE_ANIMATION_MS);
		},
	};
}
