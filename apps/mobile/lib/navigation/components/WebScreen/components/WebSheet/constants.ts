import type { SheetFrame } from "../../utils/sheetFrame";

const OPEN_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const CLOSE_EASING = "cubic-bezier(0.4, 0, 1, 1)";

export const BACKDROP_FRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

export interface SheetMotion {
	frames: Keyframe[];
	open: KeyframeAnimationOptions;
	close: KeyframeAnimationOptions;
}

export const SHEET_MOTION: Record<SheetFrame["kind"], SheetMotion> = {
	dialog: {
		frames: [
			{ opacity: 0, transform: "scale(0.96)" },
			{ opacity: 1, transform: "scale(1)" },
		],
		open: { duration: 200, easing: OPEN_EASING },
		close: { duration: 140, easing: CLOSE_EASING },
	},
	bottom: {
		frames: [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
		open: { duration: 280, easing: OPEN_EASING },
		close: { duration: 200, easing: CLOSE_EASING },
	},
};

export const CLOSE_ACTIONS = new Set([
	"GO_BACK",
	"POP",
	"POP_TO",
	"POP_TO_TOP",
]);

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
