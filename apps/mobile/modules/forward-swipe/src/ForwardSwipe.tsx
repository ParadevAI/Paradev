import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import type { ForwardSwipeComponent } from "./ForwardSwipe.types";

const EDGE_WIDTH = 20;
const ACTIVATE_AFTER = 16;

export const ForwardSwipe: ForwardSwipeComponent = ({
	enabled,
	onSwipeBegin,
}) => {
	const pan = usePanGesture({
		enabled,
		runOnJS: true,
		activeOffsetX: -ACTIVATE_AFTER,
		failOffsetY: [-ACTIVATE_AFTER, ACTIVATE_AFTER],
		onActivate: () => onSwipeBegin(),
	});
	if (!enabled) return null;
	return (
		<GestureDetector gesture={pan}>
			<View
				collapsable={false}
				style={{
					position: "absolute",
					top: 0,
					right: 0,
					bottom: 0,
					width: EDGE_WIDTH,
					zIndex: 1,
				}}
			/>
		</GestureDetector>
	);
};
