import { cn } from "@superset/ui/utils";
import { LuRadioTower } from "react-icons/lu";

const MAX_BADGE_COUNT = 9;

const SIZES = {
	default: {
		box: "size-5",
		icon: "size-3.5",
		badge: "-top-0.5 -right-[3px] size-[11px] leading-[11px] ring-[1.5px]",
		fontSize: 7.5,
		overflowFontSize: 6,
	},
	sm: {
		box: "size-[18px]",
		icon: "size-3",
		badge: "-top-0.5 -right-[3px] size-2.5 leading-2.5 ring-1",
		fontSize: 6.5,
		overflowFontSize: 5,
	},
} as const;

interface PortsCountIconProps {
	count: number;
	size?: keyof typeof SIZES;
}

export function PortsCountIcon({
	count,
	size = "default",
}: PortsCountIconProps) {
	const sizing = SIZES[size];
	const isOverflow = count > MAX_BADGE_COUNT;
	return (
		<span
			className={cn("relative flex items-center justify-center", sizing.box)}
		>
			<LuRadioTower className={sizing.icon} strokeWidth={1.75} />
			<span
				className={cn(
					"absolute rounded-full text-center bg-muted-foreground font-bold tracking-[-0.02em] text-background tabular-nums ring-sidebar dark:ring-[color-mix(in_oklab,var(--muted)_35%,var(--background))]",
					sizing.badge,
				)}
				style={{
					fontSize: isOverflow ? sizing.overflowFontSize : sizing.fontSize,
				}}
			>
				{isOverflow ? `${MAX_BADGE_COUNT}+` : count}
			</span>
		</span>
	);
}
