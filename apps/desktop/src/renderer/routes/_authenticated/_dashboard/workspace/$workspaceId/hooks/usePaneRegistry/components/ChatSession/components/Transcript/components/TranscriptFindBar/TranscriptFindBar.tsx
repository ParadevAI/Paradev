import { useLingui } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { type KeyboardEvent, type RefObject, useEffect } from "react";
import { HiChevronDown, HiChevronUp, HiMiniXMark } from "react-icons/hi2";
import { FindButton } from "./components/FindButton";

export type TranscriptFindBarProps = {
	isOpen: boolean;
	query: string;
	matchCount: number;
	/** The current match's position from 0; -1 while there is none. */
	currentIndex: number;
	loading: boolean;
	inputRef: RefObject<HTMLInputElement | null>;
	onQueryChange: (query: string) => void;
	onNext: () => void;
	onPrevious: () => void;
	onClose: () => void;
};

/**
 * The find bar over the transcript, in the shape of the terminal's: an input,
 * the count, and previous, next and close. Enter and Shift+Enter step through
 * the hits; Esc hands focus back.
 */
export function TranscriptFindBar({
	currentIndex,
	inputRef,
	isOpen,
	loading,
	matchCount,
	onClose,
	onNext,
	onPrevious,
	onQueryChange,
	query,
}: TranscriptFindBarProps) {
	const { t } = useLingui();

	useEffect(() => {
		if (!isOpen) return;
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [isOpen, inputRef]);

	if (!isOpen) return null;

	const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (event.nativeEvent.isComposing) return;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			onClose();
		} else if (event.key === "Enter" && event.target === inputRef.current) {
			event.preventDefault();
			if (event.shiftKey) onPrevious();
			else onNext();
		}
	};

	const current = currentIndex + 1;
	const total = matchCount;
	const status = !query.trim()
		? null
		: matchCount > 0
			? t({ message: `${current} of ${total}` })
			: loading
				? t({ message: "Loading…" })
				: t({ message: "No results" });

	return (
		<search
			onKeyDown={onKeyDown}
			aria-label={t({ message: "Find in Chat" })}
			className="absolute top-1 right-1 z-10 flex max-w-[calc(100%-0.5rem)] items-center rounded bg-popover/95 pl-2 pr-0.5 shadow-lg ring-1 ring-border/40 backdrop-blur"
		>
			<input
				autoCapitalize="off"
				autoComplete="off"
				autoCorrect="off"
				className="h-6 w-28 min-w-0 flex-shrink bg-transparent text-foreground text-sm placeholder:text-muted-foreground focus:outline-none"
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder={t({ message: "Find" })}
				ref={inputRef}
				spellCheck={false}
				type="text"
				value={query}
			/>
			{(status || loading) && (
				<span
					aria-live="polite"
					className={cn(
						"flex items-center gap-1 whitespace-nowrap px-1 text-muted-foreground text-xs tabular-nums",
					)}
				>
					{loading && <Spinner className="size-3" />}
					{status}
				</span>
			)}
			<div className="flex shrink-0 items-center">
				<FindButton
					disabled={matchCount === 0}
					label={t({ message: "Previous (Shift+Enter)" })}
					onClick={onPrevious}
				>
					<HiChevronUp className="size-3.5" />
				</FindButton>
				<FindButton
					disabled={matchCount === 0}
					label={t({ message: "Next (Enter)" })}
					onClick={onNext}
				>
					<HiChevronDown className="size-3.5" />
				</FindButton>
				<FindButton label={t({ message: "Close (Esc)" })} onClick={onClose}>
					<HiMiniXMark className="size-3.5" />
				</FindButton>
			</div>
		</search>
	);
}
