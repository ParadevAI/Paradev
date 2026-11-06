import type { ReactNode } from "react";
import { LuChevronRight } from "react-icons/lu";

interface PaneTileProps {
	icon: ReactNode;
	label: ReactNode;
	/** A count at the tile's end; a chevron when there is none. */
	count?: number;
	onClick: () => void;
}

/** One of the big buttons at the top of a profile: what it has, and how much. */
export function PaneTile({ icon, label, count, onClick }: PaneTileProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-border bg-background px-3 py-2.5 text-left transition-colors hover:bg-fill-hover"
		>
			<span className="flex shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
				{icon}
			</span>
			<span className="min-w-0 flex-1 truncate text-[13px] font-medium">
				{label}
			</span>
			{count === undefined ? (
				<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
			) : (
				<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
					{count}
				</span>
			)}
		</button>
	);
}
