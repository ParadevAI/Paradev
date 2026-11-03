import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	CARD_PEEK_PX,
	CARD_SCALE_STEP,
	CARD_WIDTH_PX,
	MAX_TAB_ICONS,
} from "../../constants";

interface TabIconCardProps {
	/** 0 for the front card; each step back sits further right, smaller and lower. */
	depth: number;
	color?: string;
	children: ReactNode;
}

export function TabIconCard({ depth, color, children }: TabIconCardProps) {
	return (
		<span
			className={cn(
				"absolute top-0 flex h-[18px] items-center justify-center rounded-[5px] bg-linear-to-b from-white/10 to-transparent shadow-[var(--tab-icon-card-shadow)] [&_img]:size-[11px] [&_svg]:size-3",
				color
					? "text-white [&_img]:brightness-0 [&_img]:invert"
					: "bg-[color:var(--tab-icon-card)] text-muted-foreground",
			)}
			style={{
				width: CARD_WIDTH_PX,
				left: depth * CARD_PEEK_PX,
				zIndex: MAX_TAB_ICONS - depth,
				transform: depth > 0 ? `scale(${CARD_SCALE_STEP ** depth})` : undefined,
				transformOrigin: "right center",
				backgroundColor: color,
			}}
		>
			{children}
		</span>
	);
}
