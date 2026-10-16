import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

interface HiddenCountProps {
	count: number;
	onReveal: () => void;
}

/** Gmail's circled count on the edges of the folded messages in the middle of a long thread; a click lists them. */
export function HiddenCount({ count, onReveal }: HiddenCountProps) {
	const { t } = useLingui();
	const label = t({
		message: plural(count, {
			one: "Show # older message",
			other: "Show # older messages",
		}),
	});
	return (
		<div data-fold className="relative h-[30px]">
			<span
				aria-hidden
				className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 border-y border-border"
			/>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={label}
						onClick={onReveal}
						className="absolute top-1/2 left-4 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-[12px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
					>
						{count}
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">{label}</TooltipContent>
			</Tooltip>
		</div>
	);
}
