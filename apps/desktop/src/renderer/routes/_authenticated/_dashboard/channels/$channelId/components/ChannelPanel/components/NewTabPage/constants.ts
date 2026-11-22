import type { Variants } from "framer-motion";

const ENTER_EASE = [0.19, 1, 0.22, 1] as const;

/** Codex's new-tab entrance: rows drop in 6px, 16ms apart. */
export const NEW_TAB_PAGE_VARIANTS: Variants = {
	hidden: {},
	shown: { transition: { staggerChildren: 0.016, delayChildren: 0.012 } },
};

export const NEW_TAB_HEADER_VARIANTS: Variants = {
	hidden: { opacity: 0, y: -8 },
	shown: { opacity: 1, y: 0, transition: { duration: 0.09, ease: ENTER_EASE } },
};

export const NEW_TAB_ITEM_VARIANTS: Variants = {
	hidden: { opacity: 0, y: -6 },
	shown: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.075, ease: ENTER_EASE },
	},
};

export const NEW_TAB_ROW_LIMIT = 6;
