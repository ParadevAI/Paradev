import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { LuZap } from "react-icons/lu";

export interface Suggestion {
	id: string;
	icon: ReactNode;
	text: string;
	apply: () => void;
}

interface SuggestionChipsProps {
	suggestions: Suggestion[];
	disabled?: boolean;
}

/** Linear's "Quick suggestions": dashed chips, each applying one suggested property. */
export function SuggestionChips({
	suggestions,
	disabled,
}: SuggestionChipsProps) {
	if (suggestions.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<span className="mr-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
				<LuZap className="size-3.5" />
				<Trans>Quick suggestions</Trans>
			</span>
			{suggestions.map((suggestion) => (
				<button
					key={suggestion.id}
					type="button"
					disabled={disabled}
					data-suggestion={suggestion.id}
					onClick={suggestion.apply}
					className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 text-xs text-foreground outline-none enabled:hover:bg-fill-hover focus-visible:border-foreground/40"
				>
					{suggestion.icon}
					{suggestion.text}
				</button>
			))}
		</div>
	);
}
