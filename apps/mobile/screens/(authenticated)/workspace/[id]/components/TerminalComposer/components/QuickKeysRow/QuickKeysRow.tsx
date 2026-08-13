import type { LucideIcon } from "lucide-react-native";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react-native";
import { Pressable, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { QUICK_KEYS, type TerminalQuickKey } from "../../constants";

const SYMBOL_ICONS: Record<string, LucideIcon> = {
	"arrow.up": ArrowUp,
	"arrow.down": ArrowDown,
	"arrow.left": ArrowLeft,
	"arrow.right": ArrowRight,
};

interface QuickKeysRowProps {
	onKey: (key: TerminalQuickKey) => void;
}

/**
 * Free-floating quick-key chips rendered above the composer pill (via its
 * `above` slot) — esc/tab/arrows the soft keyboard lacks. They cast a soft
 * shadow so they read as hovering over the terminal, not painted onto it.
 */
export function QuickKeysRow({ onKey }: QuickKeysRowProps) {
	const theme = useTheme();
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			keyboardShouldPersistTaps="always"
			contentContainerClassName="gap-2 px-1"
		>
			{QUICK_KEYS.map((key) => {
				const Icon = key.symbol ? SYMBOL_ICONS[key.symbol] : undefined;
				return (
					<Pressable
						key={key.id}
						onPress={() => onKey(key)}
						className="bg-secondary/90 min-w-11 items-center justify-center rounded-lg px-3 py-1.5 shadow-md active:opacity-60"
					>
						{Icon ? (
							<Icon size={14} color={theme.secondaryForeground} />
						) : (
							<Text className="text-secondary-foreground font-mono text-xs">
								{key.label}
							</Text>
						)}
					</Pressable>
				);
			})}
		</ScrollView>
	);
}
