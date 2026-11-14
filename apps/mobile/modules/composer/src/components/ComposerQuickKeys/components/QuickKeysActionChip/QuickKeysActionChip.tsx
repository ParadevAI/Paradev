import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import type { ComposerQuickKeysAction } from "../../../../Composer.types";
import {
	COMPOSER_COLORS,
	COMPOSER_METRICS,
	QUICK_KEYS_ACTION_TINTS,
} from "../../../../constants";
import { symbolIcon } from "../../../../utils/symbolIcon";
import { QUICK_KEYS_BAR_HEIGHT } from "../../constants";

interface QuickKeysActionChipProps {
	action: ComposerQuickKeysAction;
	onPress: () => void;
}

export function QuickKeysActionChip({
	action,
	onPress,
}: QuickKeysActionChipProps) {
	const [iconFailed, setIconFailed] = useState(false);
	const color = action.tint
		? QUICK_KEYS_ACTION_TINTS[action.tint]
		: COMPOSER_COLORS.foreground;
	const Icon = symbolIcon(action.symbol);
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={action.label}
			onPress={onPress}
			style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
		>
			{action.iconUri && !iconFailed ? (
				<Image
					source={{ uri: action.iconUri }}
					tintColor={color}
					contentFit="contain"
					onError={() => setIconFailed(true)}
					style={styles.mark}
				/>
			) : (
				<Icon color={color} size={16} strokeWidth={2.5} />
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	chip: {
		width: QUICK_KEYS_BAR_HEIGHT,
		height: QUICK_KEYS_BAR_HEIGHT,
		borderRadius: COMPOSER_METRICS.stripRadius,
		backgroundColor: COMPOSER_COLORS.strip,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: { backgroundColor: COMPOSER_COLORS.stripPressed },
	mark: { width: 16, height: 16 },
});
