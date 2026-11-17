import { type CompactionBlock, compactionText } from "@superset/chats-sync";
import { LuFoldVertical, LuLoaderCircle, LuRefreshCcw } from "react-icons/lu";

/** A quiet line where the Dev's context was compacted, or its session closed for a fresh one. */
export function CompactionItem({ block }: { block: CompactionBlock }) {
	const { title, detail } = compactionText(block);
	const Icon =
		block.status === "in_progress"
			? LuLoaderCircle
			: block.rollover
				? LuRefreshCcw
				: LuFoldVertical;
	return (
		<div className="flex items-start gap-2 py-1 text-muted-foreground text-xs">
			<Icon
				className={
					block.status === "in_progress"
						? "mt-px size-3 shrink-0 animate-spin"
						: "mt-px size-3 shrink-0"
				}
			/>
			<span>
				<span className="font-medium">{title}</span>
				{detail && <span> · {detail}</span>}
			</span>
		</div>
	);
}
