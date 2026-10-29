import { useLingui } from "@lingui/react/macro";
import { type EmojiItem, emojis } from "@tiptap/extension-emoji";
import { useEffect, useMemo, useRef, useState } from "react";
import { rankEmoji } from "../../../../utils/rankEmoji";
import {
	slackReactionName,
	supportsSkinTone,
	withSkinTone,
} from "../../../../utils/slackEmoji";
import { CategoryTabs } from "./components/CategoryTabs";
import { EmojiGrid, type GridSection } from "./components/EmojiGrid";
import { PickerFooter } from "./components/PickerFooter";
import { useSkinTone } from "./hooks/useSkinTone";
import {
	type CategoryId,
	pickerSections,
	type SectionId,
} from "./utils/pickerSections";

const FREQUENT = [
	"white_check_mark",
	"eyes",
	"raised_hands",
	"+1",
	"heart",
	"joy",
	"tada",
	"pray",
	"fire",
	"100",
	"rocket",
	"thinking_face",
];

export interface PickedEmoji {
	/** The catalogue's name, which the composer's emoji node keeps. */
	name: string;
	/** Slack's name for a reaction, with the skin tone. */
	reaction: string;
	/** The character with the skin tone, when one applies. */
	toned: string | null;
}

interface EmojiPickerProps {
	onPick: (emoji: PickedEmoji) => void;
}

/** Slack's emoji picker: category tabs, search, every emoji by section, a preview footer and skin tones. */
export function EmojiPicker({ onPick }: EmojiPickerProps) {
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const [tone, setTone] = useSkinTone();
	const [hovered, setHovered] = useState<EmojiItem | null>(null);
	const [focused, setFocused] = useState<EmojiItem | null>(null);
	const [active, setActive] = useState<CategoryId | "search">("search");
	const scrollRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	useEffect(() => searchRef.current?.focus(), []);

	const labels: Record<SectionId, string> = {
		frequent: t({ message: "Frequently Used" }),
		work: t({ message: "Getting Work Done" }),
		people: t({ message: "Smileys & People" }),
		nature: t({ message: "Animals & Nature" }),
		food: t({ message: "Food & Drink" }),
		travel: t({ message: "Travel & Places" }),
		activities: t({ message: "Activities" }),
		objects: t({ message: "Objects" }),
		symbols: t({ message: "Symbols" }),
		flags: t({ message: "Flags" }),
	};
	const browse = useMemo(() => pickerSections(emojis, FREQUENT), []);
	const results = useMemo(
		() => (query.trim() ? rankEmoji(emojis, query.trim(), 200) : []),
		[query],
	);
	const sections: GridSection[] = query.trim()
		? [
				{
					id: "search",
					label: t({ message: "Search results" }),
					items: results,
				},
			]
		: browse.map((s) => ({ ...s, label: labels[s.id] }));
	const categories = browse
		.map((s) => s.id)
		.filter((id): id is CategoryId => id !== "frequent" && id !== "work");

	const pick = (item: EmojiItem) =>
		onPick({
			name: item.name,
			reaction: slackReactionName(item, tone),
			toned:
				tone > 0 && item.emoji && supportsSkinTone(item.emoji)
					? withSkinTone(item.emoji, tone)
					: null,
		});
	const showSection = (id: CategoryId | "search") => {
		const list = scrollRef.current;
		if (!list) return;
		if (id === "search") {
			list.scrollTop = 0;
			searchRef.current?.focus();
			return;
		}
		setQuery("");
		requestAnimationFrame(() => {
			const section = list.querySelector<HTMLElement>(`[data-section="${id}"]`);
			if (section) list.scrollTop = section.offsetTop - list.offsetTop;
			setActive(id);
		});
	};
	const followScroll = () => {
		const list = scrollRef.current;
		if (!list || query.trim()) return;
		let current: CategoryId | "search" = "search";
		for (const section of list.querySelectorAll<HTMLElement>(
			"[data-section]",
		)) {
			const id = section.dataset.section as SectionId;
			if (section.offsetTop - list.offsetTop > list.scrollTop + 1) break;
			if (id !== "frequent" && id !== "work") current = id;
		}
		setActive(current);
	};

	return (
		<div className="flex h-[454px] w-[361px] flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground">
			<CategoryTabs
				categories={categories}
				active={active}
				labels={labels}
				onSelect={showSection}
			/>
			<div className="shrink-0 px-3 pt-3 pb-2">
				<input
					ref={searchRef}
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						scrollRef.current?.scrollTo({ top: 0 });
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" && sections[0]?.items[0]) {
							event.preventDefault();
							pick(sections[0].items[0]);
						} else if (event.key === "ArrowDown") {
							event.preventDefault();
							scrollRef.current
								?.querySelector<HTMLButtonElement>('[data-cell="0"]')
								?.focus();
						}
					}}
					placeholder={t({ message: "Search all emoji" })}
					className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40"
				/>
			</div>
			<EmojiGrid
				sections={sections}
				tone={tone}
				scrollRef={scrollRef}
				onScroll={followScroll}
				onHover={setHovered}
				onFocusCell={setFocused}
				onPick={pick}
				onLeaveTop={() => searchRef.current?.focus()}
			/>
			<PickerFooter
				preview={
					hovered ?? focused ?? (query.trim() ? (results[0] ?? null) : null)
				}
				tone={tone}
				onToneChange={setTone}
			/>
		</div>
	);
}
