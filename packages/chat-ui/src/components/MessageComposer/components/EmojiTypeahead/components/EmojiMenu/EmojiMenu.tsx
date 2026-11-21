"use client";

import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";
import type { MessageEmojiSuggestion } from "../../../../types";

type EmojiMenuProps = {
	suggestions: MessageEmojiSuggestion[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (index: number) => void;
};

export function EmojiMenu({
	suggestions,
	selectedIndex,
	onHighlight,
	onSelect,
}: EmojiMenuProps) {
	const listRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (selectedIndex == null) return;
		listRef.current
			?.querySelector(`[data-index="${selectedIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (suggestions.length === 0) return null;
	return (
		<div
			ref={listRef}
			role="listbox"
			className="relative z-50 max-h-80 w-full overflow-y-auto rounded-xl bg-popover p-1 shadow-xl ring-1 ring-border"
		>
			{suggestions.map((suggestion, index) => (
				// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
				// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
				<div
					key={suggestion.name}
					role="option"
					data-index={index}
					aria-selected={index === selectedIndex}
					className={cn(
						"flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1 text-sm",
						index === selectedIndex
							? "bg-accent text-accent-foreground"
							: "text-foreground",
					)}
					onMouseEnter={() => onHighlight(index)}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onSelect(index)}
				>
					<span className="w-5 text-center text-lg leading-none">
						{suggestion.emoji}
					</span>
					<span className="truncate">:{suggestion.name}:</span>
				</div>
			))}
		</div>
	);
}
