import type { Notice } from "@superset/chat/protocol";
import { AGENT_CLI_OUTDATED } from "@superset/shared/agent-cli-status";
import { cn } from "@superset/ui/utils";

export function NoticeRow({ item }: { item: Notice }) {
	// The recovery screen says this, with an update button.
	if (item.code === AGENT_CLI_OUTDATED) return null;
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
