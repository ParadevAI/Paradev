import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuChevronRight } from "react-icons/lu";

interface PaneRowProps {
	/** An icon or avatar, 28px square at most. */
	leading?: ReactNode;
	label: ReactNode;
	/** A second, muted line under the label. */
	detail?: ReactNode;
	/** What sits at the row's end: a time, a status dot, a menu. */
	trailing?: ReactNode;
	/** Opens something; the row gets a chevron and hover. */
	onClick?: () => void;
	className?: string;
}

/** One entry in a pane section: who or what it is, one line of detail, and where it leads. */
export function PaneRow({
	leading,
	detail,
	label,
	trailing,
	onClick,
	className,
}: PaneRowProps) {
	const content = (
		<>
			{leading !== undefined && (
				<span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
					{leading}
				</span>
			)}
			<span className="flex min-w-0 flex-1 flex-col text-left">
				<span className="truncate text-[13px] leading-[18px] font-medium">
					{label}
				</span>
				{detail !== undefined && (
					<span className="truncate text-[12px] leading-4 text-muted-foreground">
						{detail}
					</span>
				)}
			</span>
			{trailing !== undefined && (
				<span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
					{trailing}
				</span>
			)}
			{onClick && (
				<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
			)}
		</>
	);
	const classes = cn(
		"flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 py-1 text-left",
		onClick && "transition-colors hover:bg-fill-hover",
		className,
	);
	return onClick ? (
		<button type="button" onClick={onClick} className={classes}>
			{content}
		</button>
	) : (
		<div className={classes}>{content}</div>
	);
}
