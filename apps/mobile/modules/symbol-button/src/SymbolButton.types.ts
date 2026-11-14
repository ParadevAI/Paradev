import type { ComponentType } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export interface SymbolMenuItem {
	id: string;
	title: string;
	/** SF Symbol name. */
	systemImage?: string;
}

export interface SymbolButtonProps {
	/** SF Symbol name. */
	systemImage: string;
	size?: number;
	tint?: string;
	accessibilityLabel?: string;
	enabled?: boolean;
	/** Turns the tap into a pull-down menu of these items. */
	items?: SymbolMenuItem[];
	onPress?: () => void;
	onSelect?: (id: string) => void;
	style?: StyleProp<ViewStyle>;
}

export type SymbolButtonComponent = ComponentType<SymbolButtonProps>;
