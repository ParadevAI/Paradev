import { useCallback, useEffect, useRef, useState } from "react";

const UNFREEZE_DELAY_MS = 300;

/**
 * Closing a tab with the mouse holds every tab at its current width, as
 * Chrome and Codex do, so the next close button lands under the pointer.
 * Leaving the strip, a key press or blur lets the tabs resize again.
 */
export function useCloseFreeze() {
	const [frozen, setFrozen] = useState<number | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const freeze = useCallback((width: number) => {
		clearTimeout(timer.current);
		setFrozen((current) => current ?? width);
	}, []);

	const release = useCallback((delay = UNFREEZE_DELAY_MS) => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setFrozen(null), delay);
	}, []);

	useEffect(() => {
		if (frozen === null) return;
		const now = () => release(0);
		window.addEventListener("keydown", now);
		window.addEventListener("blur", now);
		return () => {
			window.removeEventListener("keydown", now);
			window.removeEventListener("blur", now);
		};
	}, [frozen, release]);

	useEffect(() => () => clearTimeout(timer.current), []);

	return { frozen, freeze, release };
}
