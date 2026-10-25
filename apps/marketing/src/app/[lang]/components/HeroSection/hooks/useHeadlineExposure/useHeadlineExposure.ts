import { useInView } from "framer-motion";
import { type RefObject, useEffect, useRef } from "react";
import { withPosthog } from "@/lib/analytics/lazy";
import { readAssignedHeadlineVariant } from "@/lib/hero-headline";
import { recordHeadlineExposure } from "../../utils/recordHeadlineExposure";

/** Records the enrolled variant once, after the visitor has seen the headline. */
export function useHeadlineExposure(
	headlineRef: RefObject<HTMLElement | null>,
) {
	const isInView = useInView(headlineRef, { amount: 0.5 });
	const recorded = useRef(false);

	useEffect(() => {
		const variant = readAssignedHeadlineVariant();
		if (!variant || !isInView || recorded.current) return;
		const recordWhenVisible = () => {
			if (recorded.current || document.visibilityState !== "visible") return;
			recorded.current = true;
			withPosthog((posthog) => recordHeadlineExposure(posthog, variant));
		};
		recordWhenVisible();
		document.addEventListener("visibilitychange", recordWhenVisible);
		return () =>
			document.removeEventListener("visibilitychange", recordWhenVisible);
	}, [isInView]);
}
