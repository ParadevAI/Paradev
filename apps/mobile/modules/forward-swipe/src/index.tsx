import { requireNativeView } from "expo";

interface NativeForwardSwipeProps {
	enabled: boolean;
	onSwipeBegin: () => void;
	style: { width: number; height: number };
}

const NativeForwardSwipe =
	requireNativeView<NativeForwardSwipeProps>("ForwardSwipe");

/**
 * A pan from the enclosing screen's right edge calls `onSwipeBegin`. The
 * screen that handler pushes then follows the finger.
 */
export function ForwardSwipe({
	enabled,
	onSwipeBegin,
}: {
	enabled: boolean;
	onSwipeBegin: () => void;
}) {
	return (
		<NativeForwardSwipe
			enabled={enabled}
			onSwipeBegin={onSwipeBegin}
			style={{ width: 0, height: 0 }}
		/>
	);
}
