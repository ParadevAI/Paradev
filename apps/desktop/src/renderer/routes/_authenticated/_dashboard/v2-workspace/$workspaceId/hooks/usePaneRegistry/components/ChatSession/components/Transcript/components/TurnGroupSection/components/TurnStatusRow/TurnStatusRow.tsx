import { Trans } from "@lingui/react/macro";
import type { TurnError } from "@superset/chat/protocol";
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
	return <TurnFailureCard error={error} latest={latest} turnId={turnId} />;
}
