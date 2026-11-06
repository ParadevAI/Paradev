import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether the user's last click or focus landed inside the element. Clicks on
 * plain text don't move document focus, so `:focus-within` alone misses them.
 */
export function useFocusWithin() {
	const [element, setElement] = useState<HTMLElement | null>(null);
	const within = useRef(false);

	useEffect(() => {
		if (!element) return;
		const track = (event: Event) => {
			within.current =
				event.target instanceof Node && element.contains(event.target);
		};
		document.addEventListener("pointerdown", track, true);
		document.addEventListener("focusin", track, true);
		return () => {
			document.removeEventListener("pointerdown", track, true);
			document.removeEventListener("focusin", track, true);
		};
	}, [element]);

	const isWithin = useCallback(() => within.current, []);
	return { ref: setElement, isWithin };
}
