import MenuView from "@expo/ui/community/menu";
import { StyleSheet, View } from "react-native";
import { useUniwind } from "uniwind";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../constants";
import { symbolIcon } from "../../utils/symbolIcon";
import type { ComposerModeMenuProps } from "./ComposerModeMenu.types";

export function ComposerModeMenu({
	options,
	selectedId,
	onSelect,
}: ComposerModeMenuProps) {
	const { theme } = useUniwind();
	const selected = options.find((option) => option.id === selectedId);
	const SelectedIcon = symbolIcon(selected?.symbol ?? options[0]?.symbol ?? "");

	return (
		<MenuView
			colorScheme={theme}
			actions={options.map((option) => ({
				id: option.id,
				title: option.label,
				state: option.id === selectedId ? "on" : "off",
			}))}
			onPressAction={({ nativeEvent }) => onSelect?.(nativeEvent.event)}
		>
			<View
				accessible
				accessibilityRole="button"
				accessibilityLabel={selected?.label}
				style={styles.trigger}
			>
				<SelectedIcon color={COMPOSER_COLORS.foreground} size={18} />
			</View>
		</MenuView>
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
