/** The Dev's thinking, kept quiet so the answer stays the focus. */
export function ThoughtBlock({ text }: { text: string }) {
	return (
		<p className="my-0.5 whitespace-pre-wrap border-border border-l-2 pl-3 text-[13px] text-muted-foreground italic leading-relaxed">
			{text.trim()}
		</p>
	);
}
