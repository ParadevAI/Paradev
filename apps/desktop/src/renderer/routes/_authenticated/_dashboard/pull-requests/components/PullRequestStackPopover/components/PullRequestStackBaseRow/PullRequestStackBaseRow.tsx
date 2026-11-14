export function PullRequestStackBaseRow({
	baseRefName,
}: {
	baseRefName: string;
}) {
	return (
		<div className="mx-1.5 flex items-center gap-2.5 px-2 py-2 text-xs leading-4 text-muted-foreground">
			<span
				aria-hidden
				className="size-4 shrink-0 rounded-full border border-border"
			/>
			<span className="truncate">{baseRefName}</span>
		</div>
	);
}
