"use client";

import type { ReactNode } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../../../../../../ui/tooltip";

export function FindButton({
	children,
	disabled,
	label,
	onClick,
}: {
	children: ReactNode;
	disabled?: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					aria-label={label}
					className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
					disabled={disabled}
					onClick={onClick}
					type="button"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
