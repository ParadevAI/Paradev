import { cn } from "@superset/ui/utils";
import { LuHash } from "react-icons/lu";
import type { ChannelMatch } from "../../utils/matchChannels";

interface ChannelMenuProps {
	channels: ChannelMatch[];
	selected: number;
	onHover: (index: number) => void;
	onPick: (channel: ChannelMatch) => void;
}

/** Slack's `#` picker above the reply box: matching channels, Enter or Tab takes one. */
export function ChannelMenu({
	channels,
	selected,
	onHover,
	onPick,
}: ChannelMenuProps) {
	return (
		<div
			role="listbox"
			className="absolute right-0 bottom-full left-0 mb-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
		>
			{channels.map((channel, index) => (
				<button
					key={channel.id}
					type="button"
					role="option"
					aria-selected={index === selected}
					onMouseDown={(event) => event.preventDefault()}
					onMouseEnter={() => onHover(index)}
					onClick={() => onPick(channel)}
					className={cn(
						"flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px]",
						index === selected && "bg-fill-selected",
					)}
				>
					<LuHash className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate text-foreground">{channel.name}</span>
				</button>
			))}
		</div>
	);
}
