import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { forwardRef, type ReactNode } from "react";

/** One icon button in the message hover bar, with its tooltip. */
export const Action = forwardRef<
	HTMLButtonElement,
	{ label: string; tooltip?: string; onClick?: () => void; children: ReactNode }
>(({ label, tooltip, onClick, children, ...rest }, ref) => (
	<Tooltip delayDuration={300}>
		<TooltipTrigger asChild>
			<button
				ref={ref}
				type="button"
				aria-label={label}
				onClick={onClick}
				className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
				{...rest}
			>
				{children}
			</button>
		</TooltipTrigger>
		<TooltipContent side="top">{tooltip ?? label}</TooltipContent>
	</Tooltip>
));
Action.displayName = "Action";
