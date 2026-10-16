import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";

interface QuoteToggleProps {
	open: boolean;
	onToggle: () => void;
}

/** Gmail's "•••" pill standing for the quoted earlier message. */
export function QuoteToggle({ open, onToggle }: QuoteToggleProps) {
	const { t } = useLingui();
	const label = open
		? t({ message: "Hide expanded content" })
		: t({ message: "Show trimmed content" });
	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-expanded={open}
					onClick={onToggle}
					className={cn(
						"mt-2 flex h-3.5 w-6 items-center justify-center rounded-full border border-border bg-muted text-[10px] leading-none text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-fill-selected",
						open && "bg-fill-selected",
					)}
				>
					•••
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
