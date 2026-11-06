import { type PointerEvent, useCallback, useEffect, useRef } from "react";
import { isPointInsideCardCone } from "../../utils/isPointInsideCardCone";

const SAFE_TRIANGLE_MAX_TRACK_MS = 1000;

/**
 * Keeps a Radix hover card open while the pointer travels from its trigger
 * toward the card. On trigger leave, a close request is deferred until the
 * pointer exits the triangle between the leave point and the card's near edge.
 */
export function useHoverCardSafeTriangle(
	isOpen: boolean,
	onOpenChange: (open: boolean) => void,
) {
	const cardElementRef = useRef<HTMLElement | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const closeDeferredRef = useRef(false);
	const onOpenChangeRef = useRef(onOpenChange);
	useEffect(() => {
		onOpenChangeRef.current = onOpenChange;
	}, [onOpenChange]);

	const stopTracking = useCallback(() => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		closeDeferredRef.current = false;
	}, []);

	const abandon = useCallback(() => {
		const shouldClose = closeDeferredRef.current;
		stopTracking();
		if (shouldClose) onOpenChangeRef.current(false);
	}, [stopTracking]);

	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open && cleanupRef.current) {
				closeDeferredRef.current = true;
				return;
			}
			if (open) stopTracking();
			onOpenChangeRef.current(open);
		},
		[stopTracking],
	);

	const onTriggerPointerLeave = useCallback(
		(event: PointerEvent) => {
			if (!isOpen || !cardElementRef.current) return;
			stopTracking();
			const apex = { x: event.clientX, y: event.clientY };
			const handlePointerMove = (moveEvent: MouseEvent) => {
				const point = { x: moveEvent.clientX, y: moveEvent.clientY };
				if (!isPointInsideCardCone(point, apex, cardElementRef.current)) {
					abandon();
				}
			};
			document.addEventListener("mousemove", handlePointerMove);
			const deadlineTimer = setTimeout(abandon, SAFE_TRIANGLE_MAX_TRACK_MS);
			cleanupRef.current = () => {
				document.removeEventListener("mousemove", handlePointerMove);
				clearTimeout(deadlineTimer);
			};
		},
		[abandon, isOpen, stopTracking],
	);

	const setCardElement = useCallback((element: HTMLElement | null) => {
		cardElementRef.current = element;
	}, []);

	useEffect(() => stopTracking, [stopTracking]);

	return {
		onOpenChange: handleOpenChange,
		onTriggerPointerLeave,
		onCardPointerEnter: stopTracking,
		setCardElement,
	};
}
