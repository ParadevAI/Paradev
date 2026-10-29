import { Check } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ComposerModeOption } from "../../Composer.types";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../constants";
import { symbolIcon } from "../../utils/symbolIcon";

interface ComposerModeMenuProps {
	options: ComposerModeOption[];
	selectedId?: string | null;
	onSelect?: (id: string) => void;
}

export function ComposerModeMenu({
	options,
	selectedId,
	onSelect,
}: ComposerModeMenuProps) {
	const [open, setOpen] = useState(false);
	const insets = useSafeAreaInsets();
	const selected = options.find((option) => option.id === selectedId);
	const SelectedIcon = symbolIcon(selected?.symbol ?? options[0]?.symbol ?? "");

	return (
		<>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={selected?.label}
				hitSlop={4}
				onPress={() => setOpen(true)}
				style={styles.trigger}
			>
				<SelectedIcon color={COMPOSER_COLORS.foreground} size={18} />
			</Pressable>
			<Modal
				transparent
				animationType="fade"
				visible={open}
				onRequestClose={() => setOpen(false)}
				statusBarTranslucent
				navigationBarTranslucent
			>
				<Pressable style={styles.scrim} onPress={() => setOpen(false)}>
					<View style={[styles.sheet, { marginBottom: insets.bottom + 12 }]}>
						{options.map((option) => {
							const OptionIcon = symbolIcon(option.symbol);
							return (
								<Pressable
									key={option.id}
									accessibilityRole="menuitem"
									onPress={() => {
										setOpen(false);
										onSelect?.(option.id);
									}}
									style={({ pressed }) => [
										styles.row,
										pressed && styles.rowPressed,
									]}
								>
									<OptionIcon color={COMPOSER_COLORS.foreground} size={18} />
									<Text style={styles.label}>{option.label}</Text>
									{option.id === selectedId ? (
										<Check color={COMPOSER_COLORS.foreground} size={18} />
									) : null}
								</Pressable>
							);
						})}
					</View>
				</Pressable>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	trigger: {
		width: COMPOSER_METRICS.controlSize,
		height: COMPOSER_METRICS.controlSize,
		borderRadius: COMPOSER_METRICS.controlSize / 2,
		backgroundColor: COMPOSER_COLORS.control,
		alignItems: "center",
		justifyContent: "center",
	},
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
	label: { flex: 1, color: COMPOSER_COLORS.foreground, fontSize: 16 },
});
