import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { cn } from "@/lib/utils";
import {
	ScrollButton,
	type ScrollButtonProps,
} from "./components/ScrollButton";

const IN_MS = 180;
const OUT_MS = 160;

/**
 * Floats over the terminal while its viewport is scrolled up, the native half
 * of the page's overlay scrollbar: same question, same lifetime, opposite
 * edges. Positioned rather than laid out — the terminal's bottom inset is
 * measured from the composer stack, and joining it would resize the PTY every
 * time the button came and went. Staying inside that container is also what
 * gives it keyboard avoidance for free: the container's bottom margin grows by
 * the keyboard height under a LayoutAnimation on the keyboard's own curve, and
 * anything anchored to its bottom edge rides along.
 */
export function ScrollToBottomButton({
	icon,
	visible,
	onPress,
	bottomInset = 0,
	className,
	diameter,
}: {
	icon: ScrollButtonProps["icon"];
	visible: boolean;
	onPress: () => void;
	bottomInset?: number;
	className?: string;
	diameter?: number;
}) {
	// Mounted whenever a terminal is: fading out requires outliving the state
	// change that hid it.
	const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

	useEffect(() => {
		const animation = Animated.timing(progress, {
			toValue: visible ? 1 : 0,
			duration: visible ? IN_MS : OUT_MS,
			easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
			// The PTY streams onto the JS thread continuously, so this has to run
			// on the UI thread or the fade stutters under output.
			useNativeDriver: true,
		});
		animation.start();
		return () => animation.stop();
	}, [visible, progress]);

	return (
		<Animated.View
			className={cn("absolute inset-x-0 bottom-3 items-center", className)}
			pointerEvents={visible ? "box-none" : "none"}
			style={{ opacity: progress, marginBottom: bottomInset }}
		>
			<ScrollButton icon={icon} onPress={onPress} diameter={diameter} />
		</Animated.View>
	);
}
