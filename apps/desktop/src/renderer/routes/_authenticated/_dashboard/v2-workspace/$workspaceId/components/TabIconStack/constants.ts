export const MAX_TAB_ICONS = 5;

/** Sizes measured from Rex's tab icon stack: each card behind peeks out to the right, a step smaller. */
export const CARD_WIDTH_PX = 22;
export const CARD_PEEK_PX = 5;
export const CARD_SCALE_STEP = 0.9;

/** Agents whose card takes their brand colour, with the glyph drawn white on it. */
export const AGENT_CARD_COLORS: Readonly<Record<string, string>> = {
	claude: "#d97757",
};
