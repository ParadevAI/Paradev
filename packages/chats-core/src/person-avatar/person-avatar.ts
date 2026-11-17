/**
 * Earthy mid-tones for people's avatars, beside the Devs' palette rather than in it, each dark enough for a white
 * initial in light and dark mode.
 */
export const PERSON_COLORS = [
	"#B5573B",
	"#7A4A78",
	"#2F5D8A",
	"#2F6F6A",
	"#55764F",
	"#9A6A1C",
	"#B04A64",
	"#56607A",
	"#6E62A8",
	"#4B4F9A",
] as const;

/** A person's avatar colour, the same for their name in every chat and in both apps. */
export function personColor(name: string): string {
	let hash = 0;
	for (const ch of name.trim().toLowerCase())
		hash = (Math.imul(hash, 31) + ch.codePointAt(0)!) >>> 0;
	return PERSON_COLORS[hash % PERSON_COLORS.length]!;
}

/** Up to two initials: the first letters of the first two words ("Nina Park" → "NP"), else the name's first letter. */
export function personInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const letters = words.slice(0, 2).map((w) => Array.from(w)[0]!);
	return letters.join("").toUpperCase() || "?";
}
