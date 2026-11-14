import { Pressable } from "react-native";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SymbolButtonGlyph } from "./components/SymbolButtonGlyph";
import { SYMBOL_ICONS } from "./constants";
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
	const content = (
		<SymbolButtonGlyph
			systemImage={systemImage}
			size={size}
			tint={tint}
			enabled={enabled}
		/>
	);

	if (!items) {
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

	return (
		<DropdownMenu style={style}>
			<DropdownMenuTrigger
				accessibilityLabel={accessibilityLabel}
				disabled={!enabled}
				className="flex-1"
			>
				{content}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{items.map((item) => {
					const itemGlyph = item.systemImage
						? SYMBOL_ICONS[item.systemImage]
						: undefined;
					return (
						<DropdownMenuItem key={item.id} onPress={() => onSelect?.(item.id)}>
							{itemGlyph ? <Icon as={itemGlyph} className="size-4" /> : null}
							<Text>{item.title}</Text>
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
