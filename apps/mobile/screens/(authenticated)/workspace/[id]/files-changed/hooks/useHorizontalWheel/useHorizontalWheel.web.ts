import { useEffect, useRef } from "react";
import type { ViewInstance } from "react-native";
import type { UseHorizontalWheel } from "./useHorizontalWheel.types";

const LINE_PX = 16;

export const useHorizontalWheel: UseHorizontalWheel = ({
	scrollX,
	maxScrollX,
}) => {
	const ref = useRef<ViewInstance | null>(null);

	useEffect(() => {
		const element = ref.current as unknown as HTMLElement | null;
		if (!element) return;
		const onWheel = (event: WheelEvent) => {
			const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_PX : 1;
			const sideways = event.shiftKey
				? event.deltaX || event.deltaY
				: Math.abs(event.deltaX) > Math.abs(event.deltaY)
					? event.deltaX
					: 0;
			if (sideways === 0) return;
			event.preventDefault();
			scrollX.value = Math.min(
				Math.max(scrollX.value + sideways * scale, 0),
				maxScrollX.value,
			);
		};
		element.addEventListener("wheel", onWheel, { passive: false });
		return () => element.removeEventListener("wheel", onWheel);
	}, [scrollX, maxScrollX]);

	return ref;
};
