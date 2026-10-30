import { Trans } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";

export function StatusWord({
	interrupted,
	status,
}: {
	status: ToolCall["status"];
	interrupted?: boolean;
}) {
	switch (status) {
		case "failed":
			return (
				<span className="shrink-0 font-mono text-[11px] text-destructive/80 lowercase">
					<Trans>Failed</Trans>
				</span>
			);
		case "declined":
			return (
				<span className="shrink-0 font-mono text-[11px] text-destructive/80 lowercase">
					<Trans>Denied</Trans>
				</span>
			);
		case "canceled":
			return (
				<span className="shrink-0 font-mono text-[11px] text-muted-foreground/70 lowercase">
					{interrupted ? <Trans>Interrupted</Trans> : <Trans>Canceled</Trans>}
				</span>
			);
		default:
			return null;
	}
}
