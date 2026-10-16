import { useCallback } from "react";
import { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

/**
 * Keeps content's bottom edge level with the composer's top edge on every
 * frame, from the position the composer reports natively. A shared value, so
 * a frame of movement costs no React render.
 */
export function useComposerEdge(follows: boolean) {
	const edge = useSharedValue(0);

	const onEdgeChange = useCallback(
		(inset: number) => {
			edge.value = inset;
		},
		[edge],
	);

	const followStyle = useAnimatedStyle(() => ({
		marginBottom: follows ? edge.value : 0,
	}));

	return { onEdgeChange, followStyle };
}
