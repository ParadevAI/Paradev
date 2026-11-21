import { Pressable, StyleSheet, Text } from "react-native";
import type { ComposerQuickKey } from "../../../../Composer.types";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../../../constants";
import { symbolIcon } from "../../../../utils/symbolIcon";

interface QuickKeyProps {
	quickKey: ComposerQuickKey;
	onPress: (id: string) => void;
}

export function QuickKey({ quickKey, onPress }: QuickKeyProps) {
	const Icon = quickKey.symbol ? symbolIcon(quickKey.symbol) : null;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={quickKey.label ?? quickKey.id}
			onPress={() => onPress(quickKey.id)}
			className="web:hover:opacity-80"
			style={({ pressed }) => [styles.key, pressed && styles.pressed]}
		>
			{Icon ? (
				<Icon
					color={COMPOSER_COLORS.foreground}
					size={COMPOSER_METRICS.keyGlyph + 2}
				/>
			) : (
				<Text style={styles.label}>{quickKey.label}</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	key: {
		flexGrow: 1,
		minWidth: COMPOSER_METRICS.keyMinWidth,
		height: COMPOSER_METRICS.keyHeight,
		paddingHorizontal: 7,
		borderRadius: COMPOSER_METRICS.keyRadius,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: { backgroundColor: COMPOSER_COLORS.keyPressed },
	label: {
		color: COMPOSER_COLORS.foreground,
		fontFamily: "monospace",
		fontSize: COMPOSER_METRICS.keyGlyph + 1,
	},
});
