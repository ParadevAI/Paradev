import { Check } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function SelectionTick({ selected }: { selected: boolean }) {
	return (
		<View
			className={cn(
				"size-6 shrink-0 items-center justify-center rounded-full border-[1.5px]",
				selected
					? "border-foreground bg-foreground"
					: "border-muted-foreground/60",
			)}
		>
			{selected ? (
				<Icon as={Check} className="text-background size-3.5" strokeWidth={3} />
			) : null}
		</View>
	);
}
