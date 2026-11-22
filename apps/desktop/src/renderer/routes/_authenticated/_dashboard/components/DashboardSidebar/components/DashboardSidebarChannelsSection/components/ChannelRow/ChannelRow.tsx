import { cn } from "@superset/ui/utils";
import { LuHash, LuLock } from "react-icons/lu";

interface ChannelRowProps {
	name: string;
	visibility: "public" | "private";
	hasUnread: boolean;
	muted: boolean;
	mentionCount: number;
	isActive: boolean;
	onClick: () => void;
}

export function ChannelRow({
	name,
	visibility,
	hasUnread,
	muted,
	mentionCount,
	isActive,
	onClick,
}: ChannelRowProps) {
	const Icon = visibility === "private" ? LuLock : LuHash;
	const isUnread = !isActive && !muted && (hasUnread || mentionCount > 0);
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
				isActive
					? "bg-fill-selected text-foreground"
					: isUnread
						? "text-foreground hover:bg-fill-hover"
						: muted
							? "text-muted-foreground/60 hover:bg-fill-hover hover:text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				isUnread ? "font-semibold" : "font-normal",
			)}
		>
			<Icon className="size-3.5 shrink-0" />
			<span className="min-w-0 flex-1 truncate text-left">{name}</span>
		</button>
	);
}
