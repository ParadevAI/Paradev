import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ValueMenuTrigger } from "./components/ValueMenuTrigger";
import type { ValueMenuComponent } from "./ValueMenu.types";

export const ValueMenu: ValueMenuComponent = ({
	a11yLabel,
	disabled = false,
	items,
	...trigger
}) => (
	<DropdownMenu>
		<DropdownMenuTrigger
			accessibilityLabel={a11yLabel}
			disabled={disabled}
			className={cn(
				"flex-row items-center gap-1",
				trigger.label === undefined && "size-9 justify-center",
			)}
		>
			<ValueMenuTrigger {...trigger} />
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
