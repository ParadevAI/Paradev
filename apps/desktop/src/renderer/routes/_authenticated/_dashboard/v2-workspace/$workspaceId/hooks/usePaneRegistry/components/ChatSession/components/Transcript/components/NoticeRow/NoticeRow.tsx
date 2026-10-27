import type { Notice } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { CompactionDivider } from "./components/CompactionDivider";

export function NoticeRow({ item }: { item: Notice }) {
	if (item.noticeKind === "compaction")
		return <CompactionDivider compaction={item.compaction} />;
	return (
		<div
			className={cn(
				"text-xs",
				item.noticeKind === "error"
					? "text-destructive"
					: "text-muted-foreground",
			)}
		>
			{item.text ?? item.noticeKind}
		</div>
	);
}
