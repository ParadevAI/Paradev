import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface OnboardingTileProps {
	icon: ReactNode;
	label: string;
	status?: ReactNode;
	onClick: () => void;
	active?: boolean;
	disabled?: boolean;
	disabledReason?: string;
}

export function OnboardingTile({
	icon,
	label,
	status,
	onClick,
	active,
	disabled,
	disabledReason,
}: OnboardingTileProps) {
	const tile = (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={active}
			className={cn(
				"flex h-28 w-full min-w-0 flex-col justify-between rounded-lg p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
				active
					? "bg-foreground/[0.12]"
					: "bg-foreground/[0.05] hover:bg-foreground/[0.09]",
			)}
		>
			<span className="flex items-start justify-between gap-2">
				<span className="text-foreground [&_svg]:size-5">{icon}</span>
				{status && (
					<span className="flex min-w-0 items-center gap-1.5 truncate whitespace-nowrap text-muted-foreground text-xs">
						{status}
					</span>
				)}
			</span>
			<span className="line-clamp-2 font-medium text-foreground text-sm">
				{label}
			</span>
		</button>
	);
	if (!disabled || !disabledReason) return tile;
	// A disabled button gets no pointer events, so the wrapper takes the hover.
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex min-w-0 cursor-not-allowed">{tile}</span>
			</TooltipTrigger>
			<TooltipContent>{disabledReason}</TooltipContent>
		</Tooltip>
	);
}
