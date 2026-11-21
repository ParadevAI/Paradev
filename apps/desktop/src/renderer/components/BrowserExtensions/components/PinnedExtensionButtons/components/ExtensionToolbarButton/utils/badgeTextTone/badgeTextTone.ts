import type { BadgeColor } from "main/lib/browser/extension-host/browser-extensions";

// Above this WCAG relative luminance, black text has more contrast than white.
const EQUAL_CONTRAST_LUMINANCE = 0.179;

function linearChannel(value: number): number {
	const srgb = value / 255;
	return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function badgeTextTone([r, g, b]: BadgeColor): "light" | "dark" {
	const luminance =
		0.2126 * linearChannel(r) +
		0.7152 * linearChannel(g) +
		0.0722 * linearChannel(b);
	return luminance > EQUAL_CONTRAST_LUMINANCE ? "dark" : "light";
}
