import { Trans } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuBell, LuBellOff, LuChevronDown } from "react-icons/lu";
import {
	type ChannelNotifyOption,
	useChannelNotifyOptions,
} from "renderer/routes/_authenticated/_dashboard/hooks/useChannelNotifyOptions";

export type ChannelNotify = "all" | "mentions" | "none";

interface ChannelNotifyMenuProps {
	/** Null follows the person's default. */
	value: ChannelNotify | null;
	onChange: (notify: ChannelNotify | null) => void;
	suppressBroadcasts: boolean;
	onSuppressBroadcastsChange: (suppress: boolean) => void;
}

/** Slack's per-channel notification setting, named on its button. */
export function ChannelNotifyMenu({
	value,
	onChange,
	suppressBroadcasts,
	onSuppressBroadcastsChange,
}: ChannelNotifyMenuProps) {
	const { options, labelFor, toOption, fromOption } = useChannelNotifyOptions();
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
					{labelFor(value)}
					<LuChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuRadioGroup
					value={toOption(value)}
					onValueChange={(next) =>
						onChange(fromOption(next as ChannelNotifyOption))
					}
				>
					{options.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuCheckboxItem
					checked={suppressBroadcasts}
					onCheckedChange={(checked) => onSuppressBroadcastsChange(checked)}
				>
					<Trans>Ignore @channel and @here</Trans>
				</DropdownMenuCheckboxItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
