import { type ReactNode, useEffect, useRef } from "react";
import { useHotkeyScopeStore } from "renderer/hotkeys/stores/hotkeyScopeStore";

const COMPOSER = "[contenteditable='true'], textarea";
// An editor mounts a moment after its block does; how long is not known, so the block waits for it.
const COMPOSER_WAIT_MS = 4000;

interface FocusFrameProps {
	unitKey: string;
	/** True for the one block of the card that answers to the keys. */
	focused: boolean;
	onFocus: () => void;
	children: ReactNode;
}

/**
 * Marks the block that has the card's focus, brings it into view when focus
 * arrives, and takes focus on a click. Keyboard focus follows: it goes to the
 * block's composer, so typing or the send key works at once, and to the block
 * itself when it has none, so Tab starts at its first field.
 */
export function FocusFrame({
	unitKey,
	focused,
	onFocus,
	children,
}: FocusFrameProps) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const frame = ref.current;
		if (!focused || !frame) return;
		frame.scrollIntoView({ block: "nearest", behavior: "smooth" });
		const take = () => {
			if (useHotkeyScopeStore.getState().active !== "inbox") return false;
			const active = document.activeElement;
			if (active !== frame && frame.contains(active)) return true;
			for (const composer of frame.querySelectorAll<HTMLElement>(COMPOSER)) {
				composer.focus({ preventScroll: true });
				if (document.activeElement === composer) return true;
			}
			frame.focus({ preventScroll: true });
			return false;
		};
		if (take()) return;
		const stop = () => {
			observer.disconnect();
			clearTimeout(timer);
			document.removeEventListener("pointerdown", stop, true);
		};
		const observer = new MutationObserver(() => {
			if (take()) stop();
		});
		observer.observe(frame, { childList: true, subtree: true });
		const timer = setTimeout(stop, COMPOSER_WAIT_MS);
		document.addEventListener("pointerdown", stop, true);
		return stop;
	}, [focused]);
	return (
		<div
			ref={ref}
			tabIndex={-1}
			data-focus-block={unitKey}
			data-focused={focused}
			onPointerDownCapture={focused ? undefined : onFocus}
			className="scroll-my-6 outline-none"
		>
			{children}
		</div>
	);
}
