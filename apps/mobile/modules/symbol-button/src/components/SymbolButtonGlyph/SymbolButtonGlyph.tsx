import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { SYMBOL_ICONS } from "../../constants";
import type { SymbolButtonProps } from "../../SymbolButton.types";

type SymbolButtonGlyphProps = Pick<
	SymbolButtonProps,
	"systemImage" | "size" | "tint" | "enabled"
>;

export function SymbolButtonGlyph({
	systemImage,
	size,
	tint,
	enabled = true,
}: SymbolButtonGlyphProps) {
	const glyph = SYMBOL_ICONS[systemImage];
	return (
		<View
			className="flex-1 items-center justify-center"
			style={{ opacity: enabled ? 1 : 0.4 }}
		>
			{glyph ? <Icon as={glyph} size={size} color={tint} /> : null}
		</View>
	);
}
