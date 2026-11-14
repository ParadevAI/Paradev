import { requireNativeView } from "expo";
import type { ForwardSwipeComponent } from "./ForwardSwipe.types";

interface NativeForwardSwipeProps {
	enabled: boolean;
	onSwipeBegin: () => void;
	style: { width: number; height: number };
}

const NativeForwardSwipe =
	requireNativeView<NativeForwardSwipeProps>("ForwardSwipe");

export const ForwardSwipe: ForwardSwipeComponent = ({
	enabled,
	onSwipeBegin,
}) => (
	<NativeForwardSwipe
		enabled={enabled}
		onSwipeBegin={onSwipeBegin}
		style={{ width: 0, height: 0 }}
	/>
);
