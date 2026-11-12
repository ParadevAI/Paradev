import { useEffect, useState } from "react";
import { rowElement } from "../../../../utils/rowElement";

/** Everything below the viewport intersects, so an instant scroll past it still reports. */
const BELOW_VIEWPORT_MARGIN = "0px 0px 1000000px 0px";

/**
 * Whether the message has scrolled above the top edge of the viewport. A row
 * the transcript window dropped is behind the spacer, which only covers rows
 * already scrolled past, so it counts without an element to observe.
 */
export function useScrolledPast(
	viewport: HTMLElement | null,
	messageId: string | null,
	droppedByWindow: boolean,
): boolean {
	const [scrolledPast, setScrolledPast] = useState(false);
	useEffect(() => {
		if (droppedByWindow) {
			setScrolledPast(true);
			return;
		}
		setScrolledPast(false);
		if (!viewport || messageId === null) return;
		if (typeof IntersectionObserver === "undefined") return;
		const element = rowElement(viewport, messageId);
		if (!element) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries.at(-1);
				if (entry) setScrolledPast(!entry.isIntersecting);
			},
			{ root: viewport, rootMargin: BELOW_VIEWPORT_MARGIN, threshold: 0 },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [viewport, messageId, droppedByWindow]);
	return scrolledPast;
}
