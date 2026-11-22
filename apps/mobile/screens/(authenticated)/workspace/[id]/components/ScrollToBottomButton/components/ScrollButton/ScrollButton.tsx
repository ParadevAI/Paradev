import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ChevronDown } from "lucide-react-native";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import type {
	ScrollButtonComponent,
	ScrollButtonProps,
} from "./ScrollButton.types";

const SIZE = 44;

const ICON = {
	arrowDown: ArrowDown,
	chevronDown: ChevronDown,
} satisfies Record<ScrollButtonProps["icon"], unknown>;

export const ScrollButton: ScrollButtonComponent = ({
	icon,
	onPress,
	diameter,
}) => {
	const { t } = useLingui();
	const size = Math.max(SIZE, diameter ?? 0);
	return (
		<Pressable
			onPress={onPress}
			testID="terminal-scroll-to-bottom"
			accessibilityRole="button"
			accessibilityLabel={t({ message: "Scroll to bottom" })}
			className="bg-secondary border-border items-center justify-center rounded-full border active:opacity-70"
			style={{ width: size, height: size }}
		>
			<Icon as={ICON[icon]} className="text-foreground size-[18px]" />
		</Pressable>
	);
};
