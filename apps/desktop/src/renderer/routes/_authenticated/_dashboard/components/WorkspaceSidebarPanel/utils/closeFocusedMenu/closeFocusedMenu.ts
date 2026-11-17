/**
 * Closes the menu that has focus the way Escape would. A menu stays open when
 * the layout moves under it, and then points at nothing.
 */
export function closeFocusedMenu(): void {
	const focused = document.activeElement;
	if (!focused?.closest('[role="menu"]')) return;
	focused.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Escape",
			code: "Escape",
			bubbles: true,
			cancelable: true,
		}),
	);
}
