/**
 * The curated tile colours a Dev's avatar can take: brand amber, chestnut and cream first, then calm companions that
 * all work under the ink or paper mark.
 */
export const DEV_COLORS = [
	"#F2B23E",
	"#8A4B2A",
	"#FBE3B0",
	"#E9775B",
	"#F2B5C0",
	"#6B3F69",
	"#B9A6E3",
	"#2F5D8A",
	"#8EC5E8",
	"#2F6F6A",
	"#9DB89A",
	"#3E5C3A",
] as const;

/** Brand ink and paper (docs/brand/logo/tokens.css): the only colours the mark comes in. */
export const INK = "#17120F";
export const PAPER = "#F5EFE4";

export type MarkTone = "ink" | "paper";

/** Whichever of the ink or paper mark contrasts more with the tile, by WCAG contrast ratio. */
export function markToneFor(background: string): MarkTone {
	const bg = luminance(background);
	return contrast(bg, luminance(INK)) >= contrast(bg, luminance(PAPER))
		? "ink"
		: "paper";
}

function contrast(a: number, b: number) {
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** WCAG relative luminance of a `#RRGGBB` colour. */
function luminance(hex: string) {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The palette colour after `color`, wrapping around; a colour outside the palette restarts the cycle. */
export function nextColor(color: string): string {
	const index = DEV_COLORS.indexOf(color as (typeof DEV_COLORS)[number]);
	return DEV_COLORS[(index + 1) % DEV_COLORS.length]!;
}

/** A palette colour other than `current`, so a shuffle always visibly changes the tile. */
export function shuffleColor(
	current: string,
	random: () => number = Math.random,
): string {
	const others = DEV_COLORS.filter((c) => c !== current);
	return others[Math.floor(random() * others.length)]!;
}
