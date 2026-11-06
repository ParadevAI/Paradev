import { Trans } from "@lingui/react/macro";
import type { UserStop } from "@superset/chat/core";
import { SquareIcon } from "lucide-react";

export function StoppedDivider({
	userStop,
}: {
	userStop: UserStop | undefined;
}) {
	return (
		<div
			className="flex items-center gap-2 text-muted-foreground text-xs"
			data-turn-stopped={userStop ?? "unknown"}
		>
			<SquareIcon aria-hidden className="size-2.5 shrink-0 fill-current" />
			<span className="min-w-0 truncate">
				{userStop === "tool_use" ? (
					<Trans>You stopped this response at a tool call</Trans>
				) : userStop === "response" ? (
					<Trans>You stopped this response</Trans>
				) : (
					<Trans>Stopped</Trans>
				)}
			</span>
			<span aria-hidden className="h-px min-w-6 flex-1 bg-border/50" />
		</div>
	);
}
