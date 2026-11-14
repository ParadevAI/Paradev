import {
	ChevronDown,
	ChevronRight,
	ChevronsUpDown,
	Ellipsis,
	type LucideIcon,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { ValueMenuProps } from "../../ValueMenu.types";

const CHEVRON_ICON: Record<
	NonNullable<ValueMenuProps["chevron"]>,
	LucideIcon
> = {
	down: ChevronDown,
	right: ChevronRight,
	upDown: ChevronsUpDown,
};

const WEIGHT_CLASS: Record<NonNullable<ValueMenuProps["weight"]>, string> = {
	regular: "font-normal",
	medium: "font-medium",
	semibold: "font-semibold",
};

type ValueMenuTriggerProps = Pick<
	ValueMenuProps,
	"label" | "tone" | "size" | "weight" | "chevron"
>;

/** What the trigger shows: a label with a chevron, or an ellipsis. */
export function ValueMenuTrigger({
	label,
	tone = "muted",
	size = 13,
	weight = "regular",
	chevron = "down",
}: ValueMenuTriggerProps) {
	if (label === undefined) {
		return <Icon as={Ellipsis} className="text-muted-foreground size-[17px]" />;
	}
	return (
		<>
			<Text
				numberOfLines={1}
				className={cn(
					WEIGHT_CLASS[weight],
					tone === "muted" ? "text-muted-foreground" : "text-foreground",
				)}
				style={{ fontSize: size }}
			>
				{label}
			</Text>
			<Icon
				as={CHEVRON_ICON[chevron]}
				className="text-muted-foreground"
				size={size - 2}
			/>
		</>
	);
}
