import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { ComponentType, ReactNode } from "react";

export const RAIL_ICON_CLASS = "size-[18px]";
export const RAIL_ICON_STROKE_WIDTH = 1.75;

export function railButtonClass(isActive: boolean) {
	return cn(
		"relative flex size-9 items-center justify-center rounded-[10px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
		isActive
			? "bg-fill-selected text-foreground"
			: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
	);
}

interface RailButtonProps {
	label: string;
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	/** A filled glyph (Phosphor, Codicons) keeps its own shape; the rail's stroke would thicken it. */
	isIconFilled?: boolean;
	isActive?: boolean;
	onClick: () => void;
	badge?: ReactNode;
}

export function RailButton({
	label,
	icon: Icon,
	isIconFilled = false,
	isActive = false,
	onClick,
	badge,
}: RailButtonProps) {
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-current={isActive ? "page" : undefined}
					onClick={onClick}
					className={railButtonClass(isActive)}
				>
					<Icon
						className={RAIL_ICON_CLASS}
						// Omitted, not undefined: react-icons would then drop the glyph's
						// own stroke-width="0" and SVG would draw a 1-unit outline.
						{...(isIconFilled ? {} : { strokeWidth: RAIL_ICON_STROKE_WIDTH })}
					/>
					{badge}
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}
