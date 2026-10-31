import { Button, Host, HStack, Image, Menu, Text } from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	disabled as disabledModifier,
	font,
	foregroundStyle,
	frame,
	lineLimit,
} from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "@/hooks/useTheme";
import type { ValueMenuComponent, ValueMenuProps } from "./ValueMenu.types";

const CHEVRON_SYMBOL = {
	down: "chevron.down",
	right: "chevron.right",
	upDown: "chevron.up.chevron.down",
} as const satisfies Record<NonNullable<ValueMenuProps["chevron"]>, string>;

export const ValueMenu: ValueMenuComponent = ({
	label,
	a11yLabel,
	tone = "muted",
	size = 13,
	weight = "regular",
	chevron = "down",
	disabled = false,
	items,
}) => {
	const theme = useTheme();
	const color = tone === "muted" ? theme.mutedForeground : theme.foreground;
	return (
		<Host matchContents>
			<Menu
				label={
					label === undefined ? (
						<Image
							systemName="ellipsis"
							size={17}
							color={theme.mutedForeground}
							modifiers={[frame({ width: 36, height: 36 })]}
						/>
					) : (
						<HStack spacing={4}>
							<Text
								modifiers={[
									font({ size, weight }),
									foregroundStyle(color),
									lineLimit(1),
								]}
							>
								{label}
							</Text>
							<Image
								systemName={CHEVRON_SYMBOL[chevron]}
								size={size - 4}
								color={theme.mutedForeground}
							/>
						</HStack>
					)
				}
				modifiers={[accessibilityLabel(a11yLabel), disabledModifier(disabled)]}
			>
				{items.map((item) => (
					<Button
						key={item.key}
						label={item.label}
						systemImage={item.checked ? "checkmark" : undefined}
						onPress={item.onSelect}
					/>
				))}
			</Menu>
		</Host>
	);
};
