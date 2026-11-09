"use client";

import { useLingui } from "@lingui/react/macro";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { cn } from "../../../../../../lib/utils";
import type { PageFindState } from "../../hooks/usePageFind/utils/pageFindState";
import { FindButton } from "./components/FindButton";

interface PageFindBarProps {
	state: PageFindState;
	className?: string;
	onQueryChange: (query: string) => void;
	onNext: () => void;
	onPrevious: () => void;
	onClose: () => void;
}

/**
 * The find bar over a page, in the shape of the chat's: an input, the count,
 * and previous, next and close. Enter and Shift+Enter step through the hits;
 * Esc closes it.
 */
export function PageFindBar({
	state,
	className,
	onQueryChange,
	onNext,
	onPrevious,
	onClose,
}: PageFindBarProps) {
	const { t } = useLingui();
	const inputRef = useRef<HTMLInputElement>(null);
	const { availability, focusRequest, query, result } = state;
	const unavailable = availability === "unavailable";

	// biome-ignore lint/correctness/useExhaustiveDependencies: each request, and the input turning usable, re-focuses
	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [focusRequest, unavailable]);

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

	const total = result?.total ?? 0;
	const current = (result?.index ?? -1) + 1;
	const status = unavailable
		? t({ message: "Find is not available for this page" })
		: !query.trim() || !result
			? null
			: total === 0
				? t({ message: "No results" })
				: result.capped
					? t({ message: `${current} of ${total}+` })
					: t({ message: `${current} of ${total}` });

	return (
		<search
			onKeyDown={onKeyDown}
			aria-label={t({ message: "Find in page" })}
			className={cn(
				"pointer-events-auto absolute right-3 z-40 flex max-w-[calc(100%-1.5rem)] items-center rounded bg-popover/95 pl-2 pr-0.5 shadow-lg ring-1 ring-border/40 backdrop-blur",
				className,
			)}
		>
			<input
				autoCapitalize="off"
				autoComplete="off"
				autoCorrect="off"
				className="h-6 w-36 min-w-0 flex-shrink bg-transparent text-foreground text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
				disabled={unavailable}
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder={t({ message: "Find" })}
				ref={inputRef}
				spellCheck={false}
				type="text"
				value={query}
			/>
			<span
				aria-live="polite"
				className="min-w-[5.5rem] whitespace-nowrap px-1 text-right text-muted-foreground text-xs tabular-nums"
			>
				{status}
			</span>
			<div className="flex shrink-0 items-center">
				<FindButton
					disabled={total === 0 || unavailable}
					label={t({ message: "Previous (Shift+Enter)" })}
					onClick={onPrevious}
				>
					<ChevronUp className="size-3.5" />
				</FindButton>
				<FindButton
					disabled={total === 0 || unavailable}
					label={t({ message: "Next (Enter)" })}
					onClick={onNext}
				>
					<ChevronDown className="size-3.5" />
				</FindButton>
				<FindButton label={t({ message: "Close (Esc)" })} onClick={onClose}>
					<X className="size-3.5" />
				</FindButton>
			</div>
		</search>
	);
}
