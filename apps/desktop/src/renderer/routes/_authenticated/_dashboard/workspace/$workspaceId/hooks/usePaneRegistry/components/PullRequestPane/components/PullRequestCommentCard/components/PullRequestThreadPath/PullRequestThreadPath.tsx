import { cn } from "@superset/ui/utils";

interface PullRequestThreadPathProps {
	path: string;
	line?: number;
	/** Opens the file in the diff; without it the path is text. */
	onOpen?: () => void;
}

/**
 * A thread's file and line, trimmed from the start when the box is too
 * narrow so the filename and line stay in view: the outer box lays out
 * right-to-left, which puts the ellipsis at the start, while the isolated
 * left-to-right text inside keeps its character order.
 */
export function PullRequestThreadPath({
	path,
	line,
	onOpen,
}: PullRequestThreadPathProps) {
	const location = `${path}${line != null ? `:${line}` : ""}`;
	const text = (
		<span className="min-w-0 flex-1 truncate text-left [direction:rtl]">
			<bdi className="[direction:ltr]">{location}</bdi>
		</span>
	);
	const className = "flex min-w-0 flex-1 items-center font-mono text-[11px]";
	if (onOpen) {
		return (
			<button
				type="button"
				onClick={onOpen}
				title={path}
				className={cn(
					className,
					"text-foreground/80 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			>
				{text}
			</button>
		);
	}
	return (
		<span title={path} className={className}>
			{text}
		</span>
	);
}
