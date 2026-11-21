import { useLayoutEffect, useState } from "react";
import type { PullRequestActivityLayout } from "../../../../providers/PullRequestActivityLayoutProvider";

/** Below this the rail and its cards give way to folded rows. */
const CARD_MIN_WIDTH_REM = 30;

/**
 * The layout for the section's measured width. The ref is a callback so a
 * section that mounts after the first render (an older host answers the
 * threads later than the detail) is observed from the moment it exists.
 */
export function usePullRequestActivityWidthLayout(): {
	ref: (section: HTMLElement | null) => void;
	layout: PullRequestActivityLayout;
} {
	const [section, setSection] = useState<HTMLElement | null>(null);
	const [layout, setLayout] = useState<PullRequestActivityLayout>("card");

	useLayoutEffect(() => {
		if (!section) return;

		const update = () => {
			const rem =
				Number.parseFloat(
					getComputedStyle(document.documentElement).fontSize,
				) || 16;
			setLayout(
				section.clientWidth > 0 &&
					section.clientWidth < CARD_MIN_WIDTH_REM * rem
					? "row"
					: "card",
			);
		};

		update();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(update);
		observer.observe(section);
		return () => observer.disconnect();
	}, [section]);

	return { ref: setSection, layout };
}
