import { useCallback, useEffect, useRef, useState } from "react";

const OPEN_DELAY_MS = 250;

export interface ShownTabPreview {
	key: string;
	anchor: DOMRect;
}

/**
 * Codex's hover timing: the first card waits 250ms, moving to another tab
 * while one shows swaps it at once, and leaving closes it at once.
 */
export function useTabPreviewHover() {
	const [shown, setShown] = useState<ShownTabPreview | null>(null);
	const shownRef = useRef(shown);
	shownRef.current = shown;
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const enter = useCallback((key: string, element: HTMLElement) => {
		clearTimeout(timer.current);
		const show = () =>
			setShown({ key, anchor: element.getBoundingClientRect() });
		if (shownRef.current) show();
		else timer.current = setTimeout(show, OPEN_DELAY_MS);
	}, []);

	const leave = useCallback(() => {
		clearTimeout(timer.current);
		setShown(null);
	}, []);

	useEffect(() => {
		if (!shown) return;
		window.addEventListener("blur", leave);
		window.addEventListener("scroll", leave, true);
		return () => {
			window.removeEventListener("blur", leave);
			window.removeEventListener("scroll", leave, true);
		};
	}, [shown, leave]);

	useEffect(() => () => clearTimeout(timer.current), []);

	return { shown, enter, leave };
}
