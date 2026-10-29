"use client";

import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { MentionSection } from "../../hooks/useMentionSources";
import type { ComposerMentionEntry } from "../../types";

export type MentionListProps = {
	sections: MentionSection[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (entry: ComposerMentionEntry) => void;
	onSelectionChange?: (entry: ComposerMentionEntry | null) => void;
	className?: string;
};

export function MentionList({
	sections,
	selectedIndex,
	onHighlight,
	onSelect,
	onSelectionChange,
	className,
}: MentionListProps) {
	const flatEntries = sections.flatMap((section) => section.entries);
	const listRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: flatEntries identity churns per render; selection identity is (index, length)
	useEffect(() => {
		onSelectionChange?.(
			selectedIndex == null ? null : (flatEntries[selectedIndex] ?? null),
		);
	}, [selectedIndex, flatEntries.length]);

	useEffect(() => {
		if (selectedIndex == null) return;
		listRef.current
			?.querySelector(`[data-index="${selectedIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	let flatIndex = -1;
	return (
		<div
			ref={listRef}
			className={cn("scroll-fade max-h-96 overflow-y-auto", className)}
		>
			{sections.map((section) => (
				<div key={section.providerId}>
					{section.title && (
						<p className="px-3 pt-2.5 pb-1 text-[13px] text-muted-foreground">
							{section.title}
						</p>
					)}
					{section.isLoading && section.entries.length === 0 && (
						<p className="px-3 pb-2 text-[15px] text-muted-foreground/60">
							{section.loadingState ?? <Trans>Loading…</Trans>}
						</p>
					)}
					{!section.isLoading &&
						section.emptyState != null &&
						section.entries.length === 0 && (
							<p className="px-3 pb-2 text-[15px] text-muted-foreground/60">
								{section.emptyState}
							</p>
						)}
					{section.entries.map((entry) => {
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
								aria-haspopup={entry.opensSubmenu ? "listbox" : undefined}
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-[15px] leading-[21px]",
									index === selectedIndex
										? "bg-accent text-accent-foreground"
										: "text-foreground",
								)}
								onMouseMove={() => onHighlight(index)}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onSelect(entry)}
							>
								{entry.row ?? (
									<>
										{entry.icon && (
											<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
												{entry.icon}
											</span>
										)}
										<span className="shrink-0 font-medium">{entry.label}</span>
										{entry.description && (
											<span className="min-w-0 truncate text-muted-foreground">
												{entry.description}
											</span>
										)}
									</>
								)}
								{entry.opensSubmenu && (
									<ChevronRightIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
								)}
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}
