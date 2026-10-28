"use client";

import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { ChevronLeftIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useProviderSearch } from "../../hooks/useProviderSearch";
import type {
	ComposerMentionBrowse,
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "../../types";
import { MentionList } from "../MentionList";
import { SubmenuFilters } from "./components/SubmenuFilters";

const NO_FILTERS: ReadonlySet<string> = new Set();

export type MentionSubmenuProps = {
	provider: ComposerMentionProvider & { browse: ComposerMentionBrowse };
	onSelect: (entry: ComposerMentionEntry) => void;
	/** Back to the menu the submenu was opened from. */
	onBack: () => void;
	onClose: () => void;
	className?: string;
};

export function MentionSubmenu({
	provider,
	onSelect,
	onBack,
	onClose,
	className,
}: MentionSubmenuProps) {
	const { t } = useLingui();
	const { browse, source } = provider;
	const [query, setQuery] = useState("");
	const [filters, setFilters] = useState(NO_FILTERS);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const { entries, isLoading } = useProviderSearch(provider, query, filters);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new result set starts at its first row
	useEffect(() => setSelectedIndex(0), [entries]);

	const sections = useMemo(
		() => [
			{
				providerId: provider.id,
				title: "",
				entries,
				isLoading,
				emptyState:
					source.kind === "search"
						? source.emptyState
						: t({ message: "No matches" }),
				...(source.kind === "search" && source.loadingState
					? { loadingState: source.loadingState }
					: {}),
			},
		],
		[entries, isLoading, provider.id, source, t],
	);

	const toggleFilter = (id: string) =>
		setFilters((previous) => {
			const next = new Set(previous);
			if (!next.delete(id)) next.add(id);
			return next;
		});

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		const caretAtStart =
			event.currentTarget.selectionStart === 0 &&
			event.currentTarget.selectionEnd === 0;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			const count = entries.length;
			if (count > 0) {
				const delta = event.key === "ArrowDown" ? 1 : -1;
				setSelectedIndex((previous) => (previous + delta + count) % count);
			}
		} else if (event.key === "Enter") {
			const entry = entries[selectedIndex];
			if (entry) onSelect(entry);
		} else if (event.key === "Escape") {
			onClose();
		} else if (event.key === "ArrowLeft" && caretAtStart) {
			onBack();
		} else {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
	};

	return (
		<div
			role="dialog"
			aria-label={browse.label}
			className={cn(
				"relative z-50 w-full rounded-2xl bg-popover/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur-sm",
				className,
			)}
		>
			<div className="flex items-center gap-1 px-1 pt-1 pb-1.5">
				<button
					type="button"
					aria-label={t({ message: "Back" })}
					className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
					onMouseDown={(event) => event.preventDefault()}
					onClick={onBack}
				>
					<ChevronLeftIcon className="size-4" />
				</button>
				<span className="text-[13px] text-muted-foreground">
					{browse.label}
				</span>
			</div>
			<input
				aria-label={browse.placeholder}
				// biome-ignore lint/a11y/noAutofocus: the person just opened this submenu to search it
				autoFocus
				className="mb-1 w-full rounded-[10px] bg-muted/60 px-3 py-1.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
				onChange={(event) => setQuery(event.target.value)}
				onKeyDown={onKeyDown}
				placeholder={browse.placeholder}
				value={query}
			/>
			<div role="listbox" aria-label={browse.label}>
				<MentionList
					sections={sections}
					selectedIndex={entries.length > 0 ? selectedIndex : null}
					onHighlight={setSelectedIndex}
					onSelect={onSelect}
				/>
			</div>
			{browse.filters && browse.filters.length > 0 && (
				<SubmenuFilters
					filters={browse.filters}
					active={filters}
					onToggle={toggleFilter}
				/>
			)}
		</div>
	);
}
