import { useMemo, useRef } from "react";
import type { GestureResponderEvent } from "react-native";

const TAP_SLOP = 10;
const TAP_MAX_MS = 500;

/**
 * Plain touch events, not a gesture-handler Tap: the native markdown text
 * view's own recognizers win over a Tap, so taps on message text never
 * reached it.
 */
export function useTapHandlers(onTap: (() => void) | undefined) {
	const onTapRef = useRef(onTap);
	onTapRef.current = onTap;
	const touchStart = useRef<{ x: number; y: number; time: number } | null>(
		null,
	);

	return useMemo(
		() => ({
			onTouchStart: (event: GestureResponderEvent) => {
				const { touches, pageX, pageY, timestamp } = event.nativeEvent;
				touchStart.current =
					touches.length === 1 ? { x: pageX, y: pageY, time: timestamp } : null;
			},
			onTouchEnd: (event: GestureResponderEvent) => {
				const start = touchStart.current;
				touchStart.current = null;
				if (!start) return;
				const { pageX, pageY, timestamp } = event.nativeEvent;
				if (
					Math.hypot(pageX - start.x, pageY - start.y) < TAP_SLOP &&
					timestamp - start.time < TAP_MAX_MS
				) {
					onTapRef.current?.();
				}
			},
			onTouchCancel: () => {
				touchStart.current = null;
			},
		}),
		[],
	);
}
