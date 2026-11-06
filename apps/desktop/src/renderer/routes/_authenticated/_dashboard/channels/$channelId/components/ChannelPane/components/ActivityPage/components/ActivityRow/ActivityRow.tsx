import { formatDateTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface ActivityAction {
	label: string;
	onClick: () => void;
}

interface ActivityRowProps {
	/** A dot or an avatar, 20px square at most. */
	leading: ReactNode;
	label: ReactNode;
	/** A second, muted line under the label. */
	detail?: ReactNode;
	at: number;
	/** Shown on hover, in place of the time. */
	actions?: ActivityAction[];
	onClick?: () => void;
	className?: string;
}

/**
 * One line of the timeline: who did what, when, and on hover what you can
 * do about it. The whole row opens the thing; the actions pick how.
 */
export function ActivityRow({
	leading,
	label,
	detail,
	at,
	actions,
	onClick,
	className,
}: ActivityRowProps) {
	const Tag = onClick ? "button" : "div";
	return (
		<div
			className={cn(
				"group/row relative flex min-h-9 items-start gap-2.5 rounded-md px-2 py-1.5",
				onClick && "transition-colors hover:bg-fill-hover",
				className,
			)}
		>
			<span className="flex h-[18px] w-5 shrink-0 items-center justify-center">
				{leading}
			</span>
			<Tag
				{...(onClick ? { type: "button" as const, onClick } : {})}
				className="flex min-w-0 flex-1 flex-col text-left"
			>
				<span className="text-[13px] leading-[18px] text-foreground">
					{label}
				</span>
				{detail !== undefined && (
					<span className="line-clamp-2 text-[12px] leading-4 text-muted-foreground empty:hidden">
						{detail}
					</span>
				)}
			</Tag>
			<span className="flex h-[18px] shrink-0 items-center text-[11px] text-muted-foreground tabular-nums">
				<span className={cn(actions?.length && "group-hover/row:hidden")}>
					{formatDateTime(new Date(at), { timeStyle: "short" })}
				</span>
				{actions?.length ? (
					<span className="hidden items-center gap-0.5 group-hover/row:flex">
						{actions.map((action) => (
							<button
								key={action.label}
								type="button"
								onClick={action.onClick}
								className="h-5 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
							>
								{action.label}
							</button>
						))}
					</span>
				) : null}
			</span>
		</div>
	);
}
