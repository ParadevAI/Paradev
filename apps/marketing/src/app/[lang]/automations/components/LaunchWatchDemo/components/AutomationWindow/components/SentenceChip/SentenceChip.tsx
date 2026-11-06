export function SentenceChip({ children }: { children?: React.ReactNode }) {
	return (
		<span className="inline-flex h-5 items-center rounded-[5px] bg-foreground/[0.06] px-1.5 text-foreground">
			{children}
		</span>
	);
}
