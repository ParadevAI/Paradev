import { useMemo, useRef } from "react";
import { Animated, PanResponder } from "react-native";

const DISMISS_DISTANCE = 64;
const DISMISS_VELOCITY = 0.8;

/** Drag down on the grabber to collapse; a short drag springs back. */
export function useSwipeToDismiss(onDismiss: () => void) {
	const offset = useRef(new Animated.Value(0)).current;
	const onDismissRef = useRef(onDismiss);
	onDismissRef.current = onDismiss;

	const panHandlers = useMemo(() => {
		const settle = () =>
			Animated.spring(offset, {
				toValue: 0,
				useNativeDriver: true,
				bounciness: 0,
			}).start();
		return PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 4,
			onPanResponderMove: (_, gesture) =>
				offset.setValue(Math.max(0, gesture.dy)),
			onPanResponderRelease: (_, gesture) => {
				if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
					onDismissRef.current();
				}
				settle();
			},
			onPanResponderTerminate: settle,
		}).panHandlers;
	}, [offset]);

	return { offset, panHandlers };
}
