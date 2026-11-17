import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuMessageSquareText } from "react-icons/lu";

interface ThreadsRowProps {
	hasUnread: boolean;
	mentionCount: number;
	isActive: boolean;
	onClick: () => void;
}

export function ThreadsRow({
	hasUnread,
	mentionCount,
	isActive,
	onClick,
}: ThreadsRowProps) {
	const isUnread = !isActive && (hasUnread || mentionCount > 0);
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
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				isUnread ? "font-semibold" : "font-normal",
			)}
		>
			<LuMessageSquareText className="size-3.5 shrink-0" />
			<span className="min-w-0 flex-1 truncate text-left">
				<Trans>Threads</Trans>
			</span>
		</button>
	);
}
