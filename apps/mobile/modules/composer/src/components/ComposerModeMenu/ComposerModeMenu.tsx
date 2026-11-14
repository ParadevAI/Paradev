import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../constants";
import { symbolIcon } from "../../utils/symbolIcon";
import { ComposerMenuSheet } from "../ComposerMenuSheet";
import type { ComposerModeMenuProps } from "./ComposerModeMenu.types";

export function ComposerModeMenu({
	options,
	selectedId,
	onSelect,
}: ComposerModeMenuProps) {
	const [open, setOpen] = useState(false);
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
			<ComposerMenuSheet
				visible={open}
				items={options.map((option) => ({
					id: option.id,
					label: option.label,
					icon: symbolIcon(option.symbol),
					checked: option.id === selectedId,
				}))}
				onSelect={(id) => onSelect?.(id)}
				onClose={() => setOpen(false)}
			/>
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
});
