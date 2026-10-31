import { ScrollView, StyleSheet, View } from "react-native";
import type {
	ComposerQuickKey,
	ComposerQuickKeysAction,
} from "../../Composer.types";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../constants";
import { QuickKey } from "./components/QuickKey";
import { QuickKeysActionChip } from "./components/QuickKeysActionChip";
import { QUICK_KEYS_BAR_HEIGHT } from "./constants";

interface ComposerQuickKeysProps {
	keys: ComposerQuickKey[];
	action?: ComposerQuickKeysAction;
	onPress: (id: string) => void;
	onAction: () => void;
}

/**
 * The terminal's keys on one surface, with the keys scrolling inside it. Keys
 * share out any room the row has beyond their natural width.
 */
export function ComposerQuickKeys({
	keys,
	action,
	onPress,
	onAction,
}: ComposerQuickKeysProps) {
	return (
		<View style={styles.row}>
			{action ? (
				<QuickKeysActionChip action={action} onPress={onAction} />
			) : null}
			{keys.length > 0 ? (
				<View style={styles.surface}>
					<ScrollView
						horizontal
						keyboardShouldPersistTaps="always"
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.keys}
					>
						{keys.map((key) =>
							key.divider ? (
								<View key={key.id} style={styles.divider} />
							) : (
								<QuickKey key={key.id} quickKey={key} onPress={onPress} />
							),
						)}
					</ScrollView>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", gap: COMPOSER_METRICS.gap },
	surface: {
		flex: 1,
		height: QUICK_KEYS_BAR_HEIGHT,
		borderRadius: COMPOSER_METRICS.stripRadius,
		backgroundColor: COMPOSER_COLORS.strip,
		overflow: "hidden",
	},
	keys: {
		flexGrow: 1,
		alignItems: "center",
		gap: 1,
		padding: COMPOSER_METRICS.stripInset,
	},
	divider: {
		width: 1,
		height: COMPOSER_METRICS.dividerHeight,
		marginHorizontal: 4,
		backgroundColor: COMPOSER_COLORS.divider,
	},
});
