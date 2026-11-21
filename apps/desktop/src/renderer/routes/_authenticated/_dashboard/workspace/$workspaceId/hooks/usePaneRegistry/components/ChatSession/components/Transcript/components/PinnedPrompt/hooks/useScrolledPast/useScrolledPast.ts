import { useEffect, useState } from "react";
import { rowElement } from "../../../../utils/rowElement";

/** Everything below the viewport intersects, so an instant scroll past it still reports. */
const BELOW_VIEWPORT_MARGIN = "0px 0px 1000000px 0px";

/** One report from the observer, kept with the message and viewport it measured. */
type Observation = {
	viewport: HTMLElement;
	messageId: string;
	scrolledPast: boolean;
};

/**
 * Whether the message has scrolled above the top edge of the viewport. A row
 * the transcript window dropped is behind the spacer, which only covers rows
 * already scrolled past, so it counts without an element to observe.
 *
 * A report applies only to the message and viewport it measured. So when the
 * last prompt changes, the new one never shows with the old one's result while
 * its own observer starts.
 */
export function useScrolledPast(
	viewport: HTMLElement | null,
	messageId: string | null,
	droppedByWindow: boolean,
): boolean {
	const [observation, setObservation] = useState<Observation | null>(null);
	useEffect(() => {
		if (droppedByWindow || !viewport || messageId === null) return;
		if (typeof IntersectionObserver === "undefined") return;
		const element = rowElement(viewport, messageId);
		if (!element) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries.at(-1);
				if (entry) {
					setObservation({
						viewport,
						messageId,
						scrolledPast: !entry.isIntersecting,
					});
				}
			},
			{ root: viewport, rootMargin: BELOW_VIEWPORT_MARGIN, threshold: 0 },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [viewport, messageId, droppedByWindow]);
	if (droppedByWindow) return true;
	return (
		observation !== null &&
		observation.viewport === viewport &&
		observation.messageId === messageId &&
		observation.scrolledPast
	);
}
