import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

interface RowActionProps {
	label: string;
	onClick: () => void;
	children: ReactNode;
}

export function RowAction({ label, onClick, children }: RowActionProps) {
	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					onClick={onClick}
					className="flex size-7 items-center justify-center text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
