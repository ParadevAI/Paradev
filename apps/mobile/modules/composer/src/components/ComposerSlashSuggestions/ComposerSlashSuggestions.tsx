import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ComposerSlashCommand } from "../../Composer.types";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../constants";

interface ComposerSlashSuggestionsProps {
	commands: ComposerSlashCommand[];
	onSelect: (command: ComposerSlashCommand) => void;
}

/**
 * The commands that match a bare `/token`. Hugs a short list and shrinks to
 * the room above the composer for a long one, which then scrolls.
 */
export function ComposerSlashSuggestions({
	commands,
	onSelect,
}: ComposerSlashSuggestionsProps) {
	return (
		<View style={styles.panel}>
			<ScrollView
				keyboardShouldPersistTaps="always"
				style={styles.scroll}
				contentContainerStyle={styles.content}
			>
				{commands.map((command) => (
					<Pressable
						key={command.id}
						accessibilityRole="button"
						onPress={() => onSelect(command)}
						style={({ pressed }) => [styles.row, pressed && styles.pressed]}
					>
						<Text numberOfLines={1} style={styles.name}>
							{command.trigger}
							{command.name}
						</Text>
						{command.descriptionText ? (
							<Text numberOfLines={1} style={styles.description}>
								{command.descriptionText}
							</Text>
						) : null}
					</Pressable>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	panel: {
		flexShrink: 1,
		minHeight: COMPOSER_METRICS.slashRowHeight,
		backgroundColor: COMPOSER_COLORS.card,
		borderColor: COMPOSER_COLORS.border,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 20,
		overflow: "hidden",
	},
	scroll: { flexGrow: 0 },
	content: { paddingVertical: 6 },
	row: { gap: 2, paddingHorizontal: 16, paddingVertical: 10 },
	pressed: { backgroundColor: COMPOSER_COLORS.control },
	name: {
		color: COMPOSER_COLORS.foreground,
		fontFamily: "monospace",
		fontSize: 14,
	},
	description: { color: COMPOSER_COLORS.muted, fontSize: 12 },
});
