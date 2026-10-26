"use client";

import { cn } from "@superset/ui/utils";
import { Fragment, useEffect, useRef } from "react";
import type { MessageMentionEntry, MessageMentionGroup } from "../../types";

type MessageMentionMenuProps = {
	groups: MessageMentionGroup[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (entry: MessageMentionEntry) => void;
};

/** The @ menu: each row is whatever the host renders for that person. */
export function MessageMentionMenu({
	groups,
	selectedIndex,
	onHighlight,
	onSelect,
}: MessageMentionMenuProps) {
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (selectedIndex == null) return;
		listRef.current
			?.querySelector(`[data-index="${selectedIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (groups.every((group) => group.entries.length === 0)) return null;
	let flatIndex = -1;
	return (
		<div
			ref={listRef}
			role="listbox"
			className="relative z-50 max-h-80 w-full overflow-y-auto rounded-xl bg-popover p-1 shadow-xl ring-1 ring-border"
		>
			{groups.map((group) =>
				group.entries.length === 0 ? null : (
					<Fragment key={group.id}>
						{group.title && (
							<p className="px-2.5 pt-2 pb-1 text-xs text-muted-foreground">
								{group.title}
							</p>
						)}
						{group.entries.map((entry) => {
							flatIndex += 1;
							const index = flatIndex;
							return (
								// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
								// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
								<div
									key={entry.id}
									role="option"
									data-index={index}
									aria-selected={index === selectedIndex}
									className={cn(
										"flex min-h-9 cursor-pointer items-center rounded-lg px-2.5 py-1 text-sm",
										index === selectedIndex
											? "bg-accent text-accent-foreground"
											: "text-foreground",
									)}
									onMouseEnter={() => onHighlight(index)}
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => onSelect(entry)}
								>
									{entry.row}
								</div>
							);
						})}
					</Fragment>
				),
			)}
		</div>
	);
}
