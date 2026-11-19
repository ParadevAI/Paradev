import { Trans } from "@lingui/react/macro";
import { Info } from "lucide-react";

export function ApprovalReason({
	reason,
	unrestricted,
}: {
	reason: string | undefined;
	unrestricted: boolean;
}) {
	return (
		<div className="flex gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
			<Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
			<div className="flex min-w-0 flex-col gap-0.5">
				{unrestricted && (
					<span className="font-medium">
						<Trans>Still asks in Full access mode</Trans>
					</span>
				)}
				<p className="break-words text-muted-foreground">
					{reason ?? (
						<Trans>
							Full access skips most approvals, but the agent still asks before
							some risky actions.
						</Trans>
					)}
				</p>
			</div>
		</div>
	);
}
