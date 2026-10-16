import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import { diffLines } from "../../utils/textDiff";

interface DescriptionDiffProps {
	before: string;
	after: string;
}

const SIGN = { same: "", removed: "−", added: "+" };

/** The description's markdown before and after, line by line, with the words that changed marked. */
export function DescriptionDiff({ before, after }: DescriptionDiffProps) {
	const lines = useMemo(() => diffLines(before, after), [before, after]);
	return (
		<div className="overflow-hidden rounded-md border border-border font-mono text-xs leading-relaxed">
			{lines.map((line, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: lines of one diff never reorder
					key={index}
					data-diff={line.kind}
					className={cn(
						"flex gap-2 px-2 whitespace-pre-wrap break-words",
						line.kind === "removed" && "bg-destructive/10 text-foreground",
						line.kind === "added" && "bg-success/10 text-foreground",
						line.kind === "same" && "text-muted-foreground",
					)}
				>
					<span aria-hidden className="w-3 shrink-0 select-none text-center">
						{SIGN[line.kind]}
					</span>
					<span className="min-w-0 flex-1">
						{line.words.map((word, at) =>
							word.changed ? (
								<mark
									// biome-ignore lint/suspicious/noArrayIndexKey: words of one line never reorder
									key={at}
									className={cn(
										"rounded-sm text-foreground",
										line.kind === "removed"
											? "bg-destructive/30 line-through"
											: "bg-success/30",
									)}
								>
									{word.text}
								</mark>
							) : (
								word.text
							),
						)}
						{line.words.every((word) => word.text === "") && " "}
					</span>
				</div>
			))}
		</div>
	);
}
