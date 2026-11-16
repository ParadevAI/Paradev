import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { LuPlus } from "react-icons/lu";

interface ChatsSectionProps {
	label: string;
	addLabel: string;
	onAdd: () => void;
	/** Shown when the section has no rows. */
	empty: string;
	children: ReactNode[];
}

export function ChatsSection({
	label,
	addLabel,
	onAdd,
	empty,
	children,
}: ChatsSectionProps) {
	return (
		<section className="mt-3 first:mt-1">
			<div className="flex h-7 items-center justify-between pr-2 pl-4 text-[10px] font-semibold tracking-[0.075em] text-muted-foreground uppercase">
				{label}
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={addLabel}
							onClick={onAdd}
							className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<LuPlus className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{addLabel}</TooltipContent>
				</Tooltip>
			</div>
			{children.length > 0 ? (
				<div className="flex flex-col gap-0.5 px-2">{children}</div>
			) : (
				<p className="px-4 py-1 text-xs text-muted-foreground">{empty}</p>
			)}
		</section>
	);
}
