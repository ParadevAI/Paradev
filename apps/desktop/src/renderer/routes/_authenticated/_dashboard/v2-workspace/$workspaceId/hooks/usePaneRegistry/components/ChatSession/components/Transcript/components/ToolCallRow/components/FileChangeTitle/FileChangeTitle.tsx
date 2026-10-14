import type { ToolCall, ToolContent } from "@superset/chat/protocol";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { useMemo } from "react";
import { DiffStatText } from "../../../../../../../../../../components/DiffStatText";
import { diffStats } from "../../../../utils/diffStats";
import type { FileChange } from "../../../../utils/fileChange";
import { FileChangePreview } from "../FileChangePreview";

type DiffToolContent = Extract<ToolContent, { type: "diff" }>;

/**
 * "Edited README.md +5 −1": the verb says what happened and whether it is
 * still happening, the name is what a row has room for, the tally is what it
 * cost. The agent's own title ("Write /full/path") says the same thing worse.
 */
export function FileChangeTitle({
	change,
	item,
	onToggle,
	running,
	verb,
}: {
	change: FileChange;
	item: ToolCall;
	/** What a click on the file name does; the row around it does the same. */
	onToggle?: (() => void) | undefined;
	running: boolean;
	verb: string;
}) {
	const diff = item.content.find(
		(content): content is DiffToolContent => content.type === "diff",
	);
	const stats = useMemo(() => {
		const counted = diff ? diffStats(diff) : null;
		return counted
			? {
					additions: change.kind === "deleted" ? 0 : counted.additions,
					deletions: change.kind === "added" ? 0 : counted.deletions,
				}
			: null;
	}, [change.kind, diff]);
	return (
		<>
			<span className="shrink-0">
				{running ? (
					<ShimmerLabel className="font-normal" duration={1.6}>
						{verb}
					</ShimmerLabel>
				) : (
					verb
				)}
			</span>{" "}
			{diff ? (
				<FileChangePreview
					change={change}
					content={diff}
					onClick={onToggle}
					stats={stats}
					status={item.status}
				>
					{change.name}
				</FileChangePreview>
			) : (
				<span
					className="min-w-0 truncate rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[13px] text-foreground/70"
					title={change.path}
				>
					{change.name}
				</span>
			)}
			{stats && !running && (
				<span
					className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums"
					data-find-skip
				>
					<DiffStatText
						additions={stats.additions}
						deletions={stats.deletions}
					/>
				</span>
			)}
		</>
	);
}
