import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import type { ForwardSwipeComponent } from "./ForwardSwipe.types";

// Gesture navigation keeps the outer ~24dp for system Back.
const EDGE_WIDTH = 40;
const ACTIVATE_AFTER = 16;

export const ForwardSwipe: ForwardSwipeComponent = ({
	enabled,
	onSwipeBegin,
}) => {
	// A 1px view with hit slop, not a 40dp strip: taps under the edge still
	// reach the content, and only a leftward pan claims the touch.
	const pan = usePanGesture({
		enabled,
		runOnJS: true,
		hitSlop: { left: EDGE_WIDTH },
		activeOffsetX: -ACTIVATE_AFTER,
		failOffsetY: [-ACTIVATE_AFTER, ACTIVATE_AFTER],
		onActivate: () => onSwipeBegin(),
	});
	return (
		<GestureDetector gesture={pan}>
			<View
				collapsable={false}
				style={{
					position: "absolute",
					top: 0,
					right: 0,
					bottom: 0,
					width: 1,
					zIndex: 1,
				}}
			/>
		</GestureDetector>
	);
};
