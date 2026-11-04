import { cn } from "@superset/ui/utils";
import type { CSSProperties, ReactNode } from "react";
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

/** A 16px cap over a 2px lip; the lip, edge and top catch are variables so a brand cap can bring its own. */
const KEY_SHADOW =
	"shadow-[0_0_0_0.5px_var(--tab-key-edge),inset_0_0.5px_0_var(--tab-key-top),inset_0_-0.5px_0_rgb(0_0_0/0.3),0_2px_0_var(--tab-key-lip),0_2.5px_1.5px_var(--tab-key-lip-shadow)]";
/** The open tab's front key sits 1.5px down on a half-pixel lip. */
const KEY_SHADOW_PRESSED =
	"group-data-[active]:translate-y-[1.5px] group-data-[active]:shadow-[0_0_0_0.5px_var(--tab-key-edge),inset_0_0.5px_0_var(--tab-key-top),inset_0_-0.5px_0_rgb(0_0_0/0.3),0_0.5px_0_var(--tab-key-lip),0_1px_1px_var(--tab-key-lip-shadow)]";

/** A brand colour as a key: lit from the top, darkened at the base, with a lip of the same hue. */
function brandCap(color: string): CSSProperties {
	return {
		backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${color} 86%, white), color-mix(in oklab, ${color} 90%, black))`,
		"--tab-key-lip": `color-mix(in oklab, ${color} 58%, black)`,
		"--tab-key-lip-shadow": "rgb(0 0 0 / 0.5)",
		"--tab-key-edge": "transparent",
		"--tab-key-top": "rgb(255 255 255 / 0.3)",
	} as CSSProperties;
}

export function TabIconCard({ depth, color, children }: TabIconCardProps) {
	return (
		<span
			className={cn(
				"absolute top-0 flex h-4 items-center justify-center rounded-[4.5px] transition-[translate,box-shadow] duration-150 [&_img]:size-[11px] [&_svg]:size-3",
				KEY_SHADOW,
				depth === 0 && KEY_SHADOW_PRESSED,
				color
					? "text-white [&_img]:brightness-0 [&_img]:invert"
					: "bg-[image:linear-gradient(to_bottom,var(--tab-key-cap-top),var(--tab-key-cap))] text-muted-foreground",
			)}
			style={{
				width: CARD_WIDTH_PX,
				left: depth * CARD_PEEK_PX,
				zIndex: MAX_TAB_ICONS - depth,
				transform: depth > 0 ? `scale(${CARD_SCALE_STEP ** depth})` : undefined,
				transformOrigin: "right center",
				...(color ? brandCap(color) : undefined),
			}}
		>
			{children}
		</span>
	);
}
