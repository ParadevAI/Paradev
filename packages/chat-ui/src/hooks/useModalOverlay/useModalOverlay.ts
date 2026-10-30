import { type RefObject, useEffect, useRef } from "react";

/**
 * Makes `dialogRef` the only live part of the page while it is mounted: the
 * rest of the body is inert, focus moves in, Escape calls `onClose`, and focus
 * returns to the opener on unmount.
 */
export function useModalOverlay(
	dialogRef: RefObject<HTMLElement | null>,
	onClose: () => void,
) {
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const opener = document.activeElement;
		const madeInert = Array.from(document.body.children).filter(
			(element) => !element.contains(dialog) && !element.hasAttribute("inert"),
		);
		for (const element of madeInert) element.setAttribute("inert", "");
		dialog.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.stopPropagation();
			onCloseRef.current();
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			for (const element of madeInert) element.removeAttribute("inert");
			if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
		};
	}, [dialogRef]);
}
