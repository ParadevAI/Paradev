import { Check, type LucideIcon } from "lucide-react-native";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../constants";

export interface ComposerMenuSheetItem {
	id: string;
	label: string;
	icon: LucideIcon;
	checked?: boolean;
	destructive?: boolean;
}

interface ComposerMenuSheetProps {
	visible: boolean;
	items: ComposerMenuSheetItem[];
	onSelect: (id: string) => void;
	onClose: () => void;
}

/** A bottom menu, the Android stand-in for a SwiftUI `Menu` or context menu. */
export function ComposerMenuSheet({
	visible,
	items,
	onSelect,
	onClose,
}: ComposerMenuSheetProps) {
	const insets = useSafeAreaInsets();
	return (
		<Modal
			transparent
			animationType="fade"
			visible={visible}
			onRequestClose={onClose}
			statusBarTranslucent
			navigationBarTranslucent
		>
			<Pressable style={styles.scrim} onPress={onClose}>
				<View style={[styles.sheet, { marginBottom: insets.bottom + 12 }]}>
					{items.map((item) => {
						const color = item.destructive
							? COMPOSER_COLORS.destructive
							: COMPOSER_COLORS.foreground;
						const Icon = item.icon;
						return (
							<Pressable
								key={item.id}
								accessibilityRole="menuitem"
								onPress={() => {
									onClose();
									onSelect(item.id);
								}}
								style={({ pressed }) => [
									styles.row,
									pressed && styles.rowPressed,
								]}
							>
								<Icon color={color} size={18} />
								<Text style={[styles.label, { color }]}>{item.label}</Text>
								{item.checked ? <Check color={color} size={18} /> : null}
							</Pressable>
						);
					})}
				</View>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	scrim: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: COMPOSER_COLORS.scrim,
		paddingHorizontal: COMPOSER_METRICS.edgeInset,
	},
	sheet: {
		backgroundColor: COMPOSER_COLORS.card,
		borderColor: COMPOSER_COLORS.border,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		paddingVertical: 6,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	rowPressed: { backgroundColor: COMPOSER_COLORS.control },
	label: { flex: 1, fontSize: 16 },
});
