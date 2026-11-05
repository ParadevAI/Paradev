"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface ToolbarButtonProps {
	label: string;
	shortcut?: string;
	active?: boolean;
	onClick: () => void;
	children: ReactNode;
}

export function ToolbarButton({
	label,
	shortcut,
	active = false,
	onClick,
	children,
}: ToolbarButtonProps) {
	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={active}
					onMouseDown={(event) => event.preventDefault()}
					onClick={onClick}
					className={cn(
						"flex size-7 items-center justify-center rounded-md transition-colors [&_svg]:size-4",
						active
							? "bg-accent text-foreground"
							: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">
				{label}
				{shortcut && (
					<span className="ml-2 text-muted-foreground">{shortcut}</span>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
