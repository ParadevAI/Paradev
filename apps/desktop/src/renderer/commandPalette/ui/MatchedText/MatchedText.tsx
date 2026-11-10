interface MatchedTextProps {
	text: string;
	query: string;
}

export function MatchedText({ text, query }: MatchedTextProps) {
	const needle = query.trim().toLowerCase();
	const start = needle ? text.toLowerCase().indexOf(needle) : -1;
	if (start < 0) return <>{text}</>;
	const end = start + needle.length;
	return (
		<>
			{text.slice(0, start)}
			<span className="text-foreground underline decoration-foreground/40 underline-offset-[3px]">
				{text.slice(start, end)}
			</span>
			{text.slice(end)}
		</>
	);
}
