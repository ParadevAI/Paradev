import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

interface IconActionProps {
	label: string;
	onClick: () => void;
	children: ReactNode;
}

/** A round 40px icon button in a message header that does not toggle the message. */
export function IconAction({ label, onClick, children }: IconActionProps) {
	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					onClick={(event) => {
						event.stopPropagation();
						onClick();
					}}
					onKeyDown={(event) => event.stopPropagation()}
					className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
