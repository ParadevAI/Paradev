import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { LuPlus } from "react-icons/lu";

interface ChatsSectionProps {
	label: string;
	addLabel: string;
	onAdd: () => void;
	/** More ways to add, shown with `addLabel` in a menu under the plus. */
	more?: { label: string; icon: ReactNode; onSelect: () => void }[];
	/** Shown when the section has no rows. */
	empty: string;
	children: ReactNode[];
}

export function ChatsSection({
	label,
	addLabel,
	onAdd,
	more,
	empty,
	children,
}: ChatsSectionProps) {
	return (
		<section className="mt-3 first:mt-1">
			<div className="flex h-7 items-center justify-between pr-2 pl-4 text-[10px] font-semibold tracking-[0.075em] text-muted-foreground uppercase">
				{label}
				{more?.length ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={addLabel}
								className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-fill-hover hover:text-foreground aria-expanded:bg-fill-hover"
							>
								<LuPlus className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-48">
							<DropdownMenuItem onSelect={onAdd}>
								<LuPlus className="size-4" />
								{addLabel}…
							</DropdownMenuItem>
							{more.map((item) => (
								<DropdownMenuItem key={item.label} onSelect={item.onSelect}>
									{item.icon}
									{item.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
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
				)}
			</div>
			{children.length > 0 ? (
				<div className="flex flex-col gap-0.5 px-2">{children}</div>
			) : (
				<p className="px-4 py-1 text-xs text-muted-foreground">{empty}</p>
			)}
		</section>
	);
}
