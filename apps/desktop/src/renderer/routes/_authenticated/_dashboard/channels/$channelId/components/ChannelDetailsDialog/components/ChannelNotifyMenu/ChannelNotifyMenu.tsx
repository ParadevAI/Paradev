import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuBell, LuBellOff, LuChevronDown } from "react-icons/lu";

export type ChannelNotify = "all" | "mentions" | "none";

interface ChannelNotifyMenuProps {
	value: ChannelNotify;
	onChange: (notify: ChannelNotify) => void;
}

/** Slack's per-channel notification setting, named on its button. */
export function ChannelNotifyMenu({ value, onChange }: ChannelNotifyMenuProps) {
	const { t } = useLingui();
	const labels: Record<ChannelNotify, string> = {
		all: t({ message: "All messages" }),
		mentions: t({ message: "Just mentions" }),
		none: t({ message: "Nothing" }),
	};
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-fill-hover"
				>
					{value === "none" ? (
						<LuBellOff className="size-4" />
					) : (
						<LuBell className="size-4" />
					)}
					{labels[value]}
					<LuChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={(next) => onChange(next as ChannelNotify)}
				>
					<DropdownMenuRadioItem value="all">
						{labels.all}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="mentions">
						{labels.mentions}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="none">
						{labels.none}
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
