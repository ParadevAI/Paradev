import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../../../constants";

interface StripControlProps {
	icon: LucideIcon;
	label: string;
	onPress: () => void;
	/** For the chevron that tabs scroll beneath: a see-through fill shows them. */
	opaque?: boolean;
}

export function StripControl({
	icon: Icon,
	label,
	onPress,
	opaque = false,
}: StripControlProps) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={4}
			onPress={onPress}
			style={({ pressed }) => [
				styles.control,
				opaque && styles.opaque,
				pressed && styles.pressed,
			]}
		>
			<Icon color={COMPOSER_COLORS.foreground} size={15} strokeWidth={2.5} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	control: {
		width: COMPOSER_METRICS.tabControlSize,
		height: COMPOSER_METRICS.tabControlSize,
		borderRadius: COMPOSER_METRICS.tabRadius,
		backgroundColor: COMPOSER_COLORS.strip,
		alignItems: "center",
		justifyContent: "center",
	},
	opaque: { backgroundColor: COMPOSER_COLORS.stripOpaque },
	pressed: { backgroundColor: COMPOSER_COLORS.stripPressed },
});
