import { Trans } from "@lingui/react/macro";
import type { Notice } from "@superset/chat/protocol";
import { AGENT_CLI_OUTDATED } from "@superset/shared/agent-cli-status";
import { cn } from "@superset/ui/utils";

export function NoticeRow({ item }: { item: Notice }) {
	if (item.code === AGENT_CLI_OUTDATED) {
		return (
			<div className="text-muted-foreground text-xs">
				<Trans>This chat stopped because its agent CLI needed an update.</Trans>
			</div>
		);
	}
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
