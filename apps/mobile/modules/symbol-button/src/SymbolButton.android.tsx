import MenuView from "@expo/ui/community/menu";
import { Pressable, StyleSheet, View } from "react-native";
import { useUniwind } from "uniwind";
import { SymbolButtonGlyph } from "./components/SymbolButtonGlyph";
import type { SymbolButtonComponent } from "./SymbolButton.types";

const DEFAULT_SIZE = 17;

export const SymbolButton: SymbolButtonComponent = ({
	systemImage,
	size = DEFAULT_SIZE,
	tint,
	accessibilityLabel,
	enabled = true,
	items,
	onPress,
	onSelect,
	style,
}) => {
	const { theme } = useUniwind();
	const content = (
		<SymbolButtonGlyph
			systemImage={systemImage}
			size={size}
			tint={tint}
			enabled={enabled}
		/>
	);

	if (!items || !enabled) {
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				disabled={!enabled}
				className="active:opacity-60"
				style={style}
				onPress={onPress}
			>
				{content}
			</Pressable>
		);
	}

	const { width, height } = StyleSheet.flatten(style) ?? {};
	return (
		<MenuView
			colorScheme={theme}
			style={style}
			actions={items.map((item) => ({ id: item.id, title: item.title }))}
			onPressAction={({ nativeEvent }) => onSelect?.(nativeEvent.event)}
		>
			<View
				accessible
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				style={{ width, height }}
			>
				{content}
			</View>
		</MenuView>
	);
};
