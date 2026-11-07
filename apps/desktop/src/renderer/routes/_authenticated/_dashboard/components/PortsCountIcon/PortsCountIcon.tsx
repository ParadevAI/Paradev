import { CountBadge } from "@superset/ui/count-badge";
import { cn } from "@superset/ui/utils";
import { LuRadioTower } from "react-icons/lu";

const MAX_BADGE_COUNT = 9;

const SIZES = {
	default: { box: "size-5", icon: "size-3.5" },
	sm: { box: "size-[18px]", icon: "size-3" },
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
	return (
		<span
			className={cn("relative flex items-center justify-center", sizing.box)}
		>
			<LuRadioTower className={sizing.icon} strokeWidth={1.75} />
			<CountBadge
				size={size}
				className="ring-sidebar dark:ring-[color-mix(in_oklab,var(--muted)_35%,var(--background))]"
			>
				{count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : count}
			</CountBadge>
		</span>
	);
}
