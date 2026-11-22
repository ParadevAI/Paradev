import { type EmojiItem, emojis } from "@tiptap/extension-emoji";
import iamcal from "emojibase-data/en/shortcodes/iamcal.json";

/** Code points as emojibase writes them, without the variation selector, so both catalogues key alike. */
export function hexcode(char: string): string {
	return [...char]
		.map((c) =>
			(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"),
		)
		.filter((hex) => hex !== "FE0F")
		.join("-");
}

const SLACK_NAMES = new Map<string, string[]>();
for (const [hex, names] of Object.entries(
	iamcal as Record<string, string | string[]>,
))
	SLACK_NAMES.set(
		hex
			.split("-")
			.filter((part) => part !== "FE0F")
			.join("-"),
		Array.isArray(names) ? names : [names],
	);

/** Slack's names for a standard emoji (iamcal's, which Slack uses); a workspace emoji keeps its own. */
export function slackNames(item: EmojiItem): string[] {
	return (item.emoji && SLACK_NAMES.get(hexcode(item.emoji))) || [item.name];
}

let byHex: Map<string, EmojiItem> | null = null;

/** The standard emoji Slack calls `name`, found by its code points rather than the catalogue's own names. */
export function emojiForSlackName(name: string): EmojiItem | undefined {
	byHex ??= new Map(
		emojis.flatMap((item) => (item.emoji ? [[hexcode(item.emoji), item]] : [])),
	);
	for (const [hex, names] of SLACK_NAMES)
		if (names.includes(name)) return byHex.get(hex);
	return emojis.find((item) => item.shortcodes.includes(name));
}

/** The character for a Slack emoji name, `+1::skin-tone-3` included; none for a workspace emoji. */
export function slackEmojiChar(name: string): string | undefined {
	const [base = "", tone] = name.split("::skin-tone-");
	const char = emojiForSlackName(base)?.emoji;
	return char && tone ? withSkinTone(char, Number(tone) - 1) : char;
}

/** Slack's five skin tones, lightest first; 0 is none. */
export const SKIN_TONES = ["", "1F3FB", "1F3FC", "1F3FD", "1F3FE", "1F3FF"];

export function supportsSkinTone(char: string): boolean {
	return /\p{Emoji_Modifier_Base}/u.test(char);
}

/** The character with the tone after each part that takes one. */
export function withSkinTone(char: string, tone: number): string {
	const modifier = SKIN_TONES[tone];
	if (!modifier) return char;
	const mark = String.fromCodePoint(Number.parseInt(modifier, 16));
	return [...char]
		.filter((c) => c !== "️")
		.map((c) => (/\p{Emoji_Modifier_Base}/u.test(c) ? c + mark : c))
		.join("");
}

/** The reaction name Slack stores, `+1::skin-tone-3` for a toned one. */
export function slackReactionName(item: EmojiItem, tone: number): string {
	const name = slackNames(item)[0] ?? item.name;
	return tone > 0 && item.emoji && supportsSkinTone(item.emoji)
		? `${name}::skin-tone-${tone + 1}`
		: name;
}
