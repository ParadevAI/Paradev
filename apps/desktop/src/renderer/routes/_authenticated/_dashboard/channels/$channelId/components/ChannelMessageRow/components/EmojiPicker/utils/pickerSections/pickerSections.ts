import type { EmojiItem } from "@tiptap/extension-emoji";
import { emojiForSlackName } from "../../../../../../utils/slackEmoji";

export type CategoryId =
	| "people"
	| "nature"
	| "food"
	| "travel"
	| "activities"
	| "objects"
	| "symbols"
	| "flags";

export type SectionId = "frequent" | "work" | CategoryId;

export interface PickerSection {
	id: SectionId;
	items: EmojiItem[];
}

/** Slack's tabs, in its order, with the catalogue groups each one holds. */
export const CATEGORIES: { id: CategoryId; groups: string[] }[] = [
	{ id: "people", groups: ["", "people & body"] },
	{ id: "nature", groups: ["animals & nature"] },
	{ id: "food", groups: ["food & drink"] },
	{ id: "travel", groups: ["travel & places"] },
	{ id: "activities", groups: ["activities"] },
	{ id: "objects", groups: ["objects"] },
	{ id: "symbols", groups: ["symbols"] },
	{ id: "flags", groups: ["flags"] },
];

/** Slack's fixed "Getting Work Done" row set, by Slack name. */
export const WORK = [
	"white_check_mark",
	"eyes",
	"raised_hands",
	"pray",
	"heavy_plus_sign",
	"clap",
	"bulb",
	"dart",
	"wave",
	"thumbsup",
	"tada",
	"one",
	"two",
	"three",
	"mega",
	"white_circle",
	"large_blue_circle",
	"red_circle",
	"cool",
	"ok",
	"sos",
	"rotating_light",
	"rocket",
	"fire",
	"heart",
	"100",
];

/** Slack's picker: frequently used, getting work done, then every category; empty ones drop. */
export function pickerSections(
	items: readonly EmojiItem[],
	frequent: readonly string[],
): PickerSection[] {
	const pick = (names: readonly string[]) =>
		names.flatMap((name) => {
			const item = emojiForSlackName(name);
			return item ? [item] : [];
		});
	const sections: PickerSection[] = [
		{ id: "frequent", items: pick(frequent) },
		{ id: "work", items: pick(WORK) },
		...CATEGORIES.map(({ id, groups }) => ({
			id,
			items: items.filter(
				(item) =>
					groups.includes(item.group ?? "") &&
					!item.name.startsWith("regional_indicator_"),
			),
		})),
	];
	return sections.filter((section) => section.items.length > 0);
}
