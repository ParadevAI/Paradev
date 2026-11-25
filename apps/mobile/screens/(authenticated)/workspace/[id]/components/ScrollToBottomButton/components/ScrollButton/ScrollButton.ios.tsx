import {
	Host,
	Button as SwiftUIButton,
	Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	buttonBorderShape,
	buttonStyle,
	frame,
} from "@expo/ui/swift-ui/modifiers";
import type {
	ScrollButtonComponent,
	ScrollButtonProps,
} from "./ScrollButton.types";

/** Matches the diameter the navigation bar's own glass buttons render at. */
const SIZE = 44;
/** The padding .glass draws around its label, measured on iOS 26. */
const GLASS_PADDING = 7;

const SYMBOL = {
	arrowDown: "arrow.down",
	chevronDown: "chevron.down",
} as const satisfies Record<ScrollButtonProps["icon"], string>;

/**
 * A real SwiftUI Button rather than glass painted behind a Pressable, so the
 * press response, the shape, and the degradation under Reduce Transparency are
 * the system's rather than ours. The app's deployment target is iOS 26, so
 * .glass is always available and needs no fallback.
 */
export const ScrollButton: ScrollButtonComponent = ({
	icon,
	onPress,
	diameter,
}) => {
	const hostSize = Math.max(SIZE, diameter ?? 0);
	const labelSize = diameter ? diameter - GLASS_PADDING * 2 : undefined;
	return (
		<Host style={{ width: hostSize, height: hostSize }} colorScheme="dark">
			<SwiftUIButton
				onPress={onPress}
				testID="terminal-scroll-to-bottom"
				modifiers={[
					buttonStyle("glass"),
					buttonBorderShape("circle"),
					// .glass sizes itself to its label, which for a lone symbol is
					// tiny — the frame is what makes it the 44pt the navigation bar's
					// own glass buttons render at.
					frame({ width: SIZE, height: SIZE }),
					accessibilityLabel("Scroll to bottom"),
				]}
			>
				<SwiftUIImage
					systemName={SYMBOL[icon]}
					size={18}
					color="#fafafa"
					modifiers={
						labelSize
							? [frame({ width: labelSize, height: labelSize })]
							: undefined
					}
				/>
			</SwiftUIButton>
		</Host>
	);
};
