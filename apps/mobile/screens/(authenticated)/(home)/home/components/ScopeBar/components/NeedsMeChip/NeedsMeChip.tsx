import { useLingui } from "@lingui/react/macro";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface NeedsMeChipProps {
	count: number;
	active: boolean;
	onPress: () => void;
}

/** Narrows the list to rows waiting on you; the count leaves out Working. */
export function NeedsMeChip({ count, active, onPress }: NeedsMeChipProps) {
	const { t } = useLingui();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected: active }}
			ph-label="needs-me-chip"
			className={cn(
				"flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-60",
				active ? "bg-foreground" : "bg-secondary/60 web:hover:bg-secondary",
			)}
		>
			<Text
				className={cn(
					"text-[14px] leading-4",
					active ? "text-background" : "text-foreground",
				)}
			>
				{t({ message: "Needs me" })}
			</Text>
			{count > 0 ? (
				<Text
					className={cn(
						"font-semibold text-[14px] leading-4",
						active ? "text-background" : "text-yellow-500",
					)}
				>
					{count}
				</Text>
			) : null}
		</Pressable>
	);
}
