import type { EmojiItem } from "@tiptap/extension-emoji";
import type {
	SuggestionKeyDownProps,
	SuggestionProps,
} from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useListCursor } from "renderer/hooks/useListCursor";

export interface EmojiSuggestionListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const EmojiSuggestionList = forwardRef<
	EmojiSuggestionListRef,
	SuggestionProps<EmojiItem>
>(({ items, command, query }, ref) => {
	const { highlighted, move, hover } = useListCursor(items.length, items);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		containerRef.current
			?.querySelector(`[data-index="${highlighted}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [highlighted]);

	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }: SuggestionKeyDownProps) => {
			if (move(event.key)) return true;
			if (items.length === 0) return false;
			if (event.key === "Enter" || event.key === "Tab") {
				const item = items[highlighted];
				if (item) command(item);
				return true;
			}
			return false;
		},
	}));

	if (items.length === 0) return null;

	return (
		<div
			ref={containerRef}
			role="listbox"
			className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md overflow-hidden max-h-72 overflow-y-auto w-64"
		>
			{items.map((item, index) => {
				const q = query.toLowerCase();
				const shortcode =
					item.shortcodes.find((s) => s.toLowerCase().includes(q)) ??
					item.shortcodes[0] ??
					item.name;
				const at = shortcode.toLowerCase().indexOf(q);
				return (
					<button
						type="button"
						role="option"
						aria-selected={index === highlighted}
						key={item.name}
						data-index={index}
						onClick={() => command(item)}
						onMouseEnter={() => hover(index)}
						className={`relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none w-full ${
							index === highlighted ? "bg-accent text-accent-foreground" : ""
						}`}
					>
						<span className="flex w-5 shrink-0 items-center text-base leading-none">
							{item.emoji ??
								(item.fallbackImage ? (
									<img src={item.fallbackImage} alt="" className="size-4" />
								) : (
									"·"
								))}
						</span>
						<span className="flex-1 truncate text-left text-xs text-muted-foreground">
							:
							{at < 0 ? (
								shortcode
							) : (
								<>
									{shortcode.slice(0, at)}
									<span className="font-semibold text-foreground">
										{shortcode.slice(at, at + q.length)}
									</span>
									{shortcode.slice(at + q.length)}
								</>
							)}
							:
						</span>
					</button>
				);
			})}
		</div>
	);
});

EmojiSuggestionList.displayName = "EmojiSuggestionList";
