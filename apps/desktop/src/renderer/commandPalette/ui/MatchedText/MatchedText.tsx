import type { ReactNode } from "react";
import { matchRanges } from "./utils/matchRanges";

interface MatchedTextProps {
	text: string;
	query: string;
}

export function MatchedText({ text, query }: MatchedTextProps) {
	const ranges = matchRanges(text, query);
	if (ranges.length === 0) return <>{text}</>;
	const parts: ReactNode[] = [];
	let cursor = 0;
	for (const [start, end] of ranges) {
		if (start > cursor) parts.push(text.slice(cursor, start));
		parts.push(
			<span
				key={start}
				className="text-foreground underline decoration-foreground/40 underline-offset-[3px]"
			>
				{text.slice(start, end)}
			</span>,
		);
		cursor = end;
	}
	if (cursor < text.length) parts.push(text.slice(cursor));
	return <>{parts}</>;
}
