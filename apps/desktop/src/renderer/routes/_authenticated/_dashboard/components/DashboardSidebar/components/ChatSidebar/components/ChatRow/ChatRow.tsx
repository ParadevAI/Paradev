import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface ChatRowProps {
	leading: ReactNode;
	title: string;
	/** One muted line under the name: the newest thing that happened there. */
	subtitle?: string;
	/** What sits at the row's end: a count with a dot, or a time. */
	trailing?: ReactNode;
	isActive: boolean;
	isUnread?: boolean;
	isMuted?: boolean;
	onClick: () => void;
}

/** A channel or a Dev in the sidebar: one line, its name and what it needs. */
export function ChatRow({
	leading,
	title,
	subtitle,
	trailing,
	isActive,
	isUnread = false,
	isMuted = false,
	onClick,
}: ChatRowProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-2 text-left transition-colors",
				subtitle ? "min-h-[44px] py-1" : "h-7",
				isActive ? "bg-fill-selected" : "hover:bg-fill-hover",
			)}
		>
			<span className="flex size-6 shrink-0 items-center justify-center">
				{leading}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span
					className={cn(
						"truncate text-[13px] leading-[18px]",
						isUnread && !isActive && !isMuted
							? "font-semibold text-foreground"
							: "font-medium",
						isMuted && !isActive && "text-muted-foreground/70",
					)}
				>
					{title}
				</span>
				{subtitle && (
					<span
						className={cn(
							"truncate text-[11.5px] leading-[15px] text-muted-foreground",
							isUnread && !isActive && !isMuted && "text-foreground/75",
						)}
					>
						{subtitle}
					</span>
				)}
			</span>
			{trailing !== undefined && (
				<span className="flex shrink-0 items-center gap-1.5 self-start pt-0.5 text-[11px] text-muted-foreground tabular-nums">
					{trailing}
				</span>
			)}
		</button>
	);
}
