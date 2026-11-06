import { Trans } from "@lingui/react/macro";
import type { UserStop } from "@superset/chat/core";
import type { TurnError } from "@superset/chat/protocol";
import { Gauge } from "lucide-react";
import { PausedOnCloseRow } from "./components/PausedOnCloseRow";
import { StoppedDivider } from "./components/StoppedDivider";
import { TurnFailureCard } from "./components/TurnFailureCard";

export function TurnStatusRow({
	error,
	latest,
	status,
	turnId,
	userStop,
}: {
	status: "failed" | "interrupted";
	error: TurnError | undefined;
	latest: boolean;
	turnId: string;
	userStop?: UserStop | undefined;
}) {
	if (error?.kind === "host_stopped")
		return <PausedOnCloseRow latest={latest} />;
	if (status === "interrupted") return <StoppedDivider userStop={userStop} />;
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
