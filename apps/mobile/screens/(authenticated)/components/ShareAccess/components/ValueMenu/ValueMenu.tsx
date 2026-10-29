import {
	ChevronDown,
	ChevronRight,
	ChevronsUpDown,
	Ellipsis,
	type LucideIcon,
} from "lucide-react-native";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { ValueMenuComponent, ValueMenuProps } from "./ValueMenu.types";

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

export const ValueMenu: ValueMenuComponent = ({
	label,
	a11yLabel,
	tone = "muted",
	size = 13,
	weight = "regular",
	chevron = "down",
	disabled = false,
	items,
}) => (
	<DropdownMenu>
		<DropdownMenuTrigger
			accessibilityLabel={a11yLabel}
			disabled={disabled}
			className={cn(
				"flex-row items-center gap-1",
				label === undefined && "size-9 justify-center",
			)}
		>
			{label === undefined ? (
				<Icon as={Ellipsis} className="text-muted-foreground size-[17px]" />
			) : (
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
			)}
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end">
			{items.map((item) => (
				<DropdownMenuCheckboxItem
					key={item.key}
					checked={item.checked ?? false}
					onCheckedChange={item.onSelect}
				>
					<Text>{item.label}</Text>
				</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	</DropdownMenu>
);
