import { Trans } from "@lingui/react/macro";
import type { TurnError } from "@superset/chat/protocol";
import { Gauge } from "lucide-react";
import { TurnFailureCard } from "./components/TurnFailureCard";

export function TurnStatusRow({
	error,
	latest,
	status,
	turnId,
}: {
	status: "failed" | "interrupted";
	error: TurnError | undefined;
	latest: boolean;
	turnId: string;
}) {
	if (status === "interrupted") {
		return (
			<div className="text-muted-foreground text-xs">
				<Trans>Stopped</Trans>
			</div>
		);
	}
	// The composer's limit notice carries the recovery; history only says why.
	if (error?.kind === "usage_limit") {
		return (
			<div
				className="flex items-center gap-1.5 text-muted-foreground text-xs"
				data-turn-usage-limit
			>
				<Gauge className="size-3.5 shrink-0" />
				<Trans>Stopped by the usage limit</Trans>
			</div>
		);
	}
	return <TurnFailureCard error={error} latest={latest} turnId={turnId} />;
}
