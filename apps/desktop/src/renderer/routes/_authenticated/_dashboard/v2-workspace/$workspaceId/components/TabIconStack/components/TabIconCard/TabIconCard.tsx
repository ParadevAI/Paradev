import { cn } from "@superset/ui/utils";
import type { CSSProperties, ReactNode } from "react";
import type { ActivePaneStatus } from "shared/tabs-types";
import {
	CARD_PEEK_PX,
	CARD_SCALE_STEP,
	CARD_WIDTH_PX,
	MAX_TAB_ICONS,
} from "../../constants";
import { StatusBead } from "./components/StatusBead";

interface TabIconCardProps {
	/** 0 for the front card; each step back sits further right, smaller and lower. */
	depth: number;
	color?: string;
	/** The pane's agent status, drawn as a glass bead on the card's top-right corner. */
	status?: ActivePaneStatus | null;
	children: ReactNode;
}

/**
 * A brand colour as tinted glass, lit in its own hue: a pale top edge, a deep
 * base, and a soft bloom, so the white sheen never washes it out.
 */
function brandGlass(color: string): CSSProperties {
	return {
		backgroundColor: `color-mix(in oklab, ${color} 94%, transparent)`,
		backgroundImage: `linear-gradient(135deg, rgb(255 255 255 / 0.2), rgb(255 255 255 / 0) 55%), linear-gradient(to bottom, transparent 40%, color-mix(in oklab, color-mix(in oklab, ${color} 55%, black) 28%, transparent))`,
		boxShadow: `inset 0 0.5px 0 color-mix(in oklab, ${color} 25%, white), inset 0.5px 0 0 color-mix(in oklab, color-mix(in oklab, ${color} 25%, white) 30%, transparent), inset 0 -0.5px 0 color-mix(in oklab, ${color} 45%, black), 0 1px 2px rgb(0 0 0 / 0.45), 0 0 6px -1px color-mix(in oklab, ${color} 45%, transparent)`,
	};
}

export function TabIconCard({
	depth,
	color,
	status,
	children,
}: TabIconCardProps) {
	return (
		<span
			className={cn(
				"absolute top-0 flex h-[18px] items-center justify-center rounded-[6px] backdrop-blur-[6px] backdrop-saturate-[1.3] [&_img]:size-[11px] [&_svg]:size-3",
				"before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:rounded-t-[6px] before:bg-linear-to-b before:to-transparent before:content-['']",
				color
					? "text-white before:from-white/12 [&_img]:brightness-0 [&_img]:invert"
					: "bg-[var(--tab-glass-fill)] bg-[image:linear-gradient(135deg,var(--tab-glass-sheen),rgb(255_255_255/0.03)_60%)] text-[var(--tab-glass-glyph)] shadow-[var(--tab-glass-shadow)] before:from-white/16 [&_svg]:drop-shadow-[var(--tab-glass-glyph-shadow)]",
			)}
			style={{
				width: CARD_WIDTH_PX,
				left: depth * CARD_PEEK_PX,
				zIndex: MAX_TAB_ICONS - depth,
				transform: depth > 0 ? `scale(${CARD_SCALE_STEP ** depth})` : undefined,
				transformOrigin: "right center",
				...(color ? brandGlass(color) : undefined),
			}}
		>
			{children}
			{status ? (
				<StatusBead status={status} className="-top-[2px] -right-[2px]" />
			) : null}
		</span>
	);
}
