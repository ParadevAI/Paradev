import { GitFork } from "lucide-react";

export function PullRequestStackPosition({
	position,
	size,
}: {
	position: number;
	size: number;
}) {
	return (
		<>
			<GitFork aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
			<span className="tabular-nums">
				{position}/{size}
			</span>
		</>
	);
}
