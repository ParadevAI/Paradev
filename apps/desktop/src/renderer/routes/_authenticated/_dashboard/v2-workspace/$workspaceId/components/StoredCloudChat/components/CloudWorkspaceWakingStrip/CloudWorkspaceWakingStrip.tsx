import { Trans } from "@lingui/react/macro";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { provisioningSince } from "renderer/routes/_authenticated/_dashboard/utils/provisioningSince";
import {
	CLOUD_START_STUCK_AFTER_SECONDS,
	formatElapsed,
	useElapsedSeconds,
} from "../../../../../hooks/useElapsedSeconds";

/** Over a stored chat: the workspace is still waking, and for how long. */
export function CloudWorkspaceWakingStrip({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const [since] = useState(() => provisioningSince(workspaceId));
	const elapsed = useElapsedSeconds(since);
	const stuck = elapsed >= CLOUD_START_STUCK_AFTER_SECONDS;
	return (
		<div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4">
			<div
				aria-live="polite"
				className="pointer-events-auto flex max-w-md flex-col items-center gap-1 rounded-2xl border border-border bg-popover px-3 py-1.5 text-popover-foreground text-xs shadow-lg"
			>
				<span className="flex items-center gap-2">
					<Loader2 className="size-3 animate-spin text-muted-foreground" />
					<Trans>Waking the workspace…</Trans>
					<span className="font-mono tabular-nums text-muted-foreground">
						{formatElapsed(elapsed)}
					</span>
				</span>
				{stuck && (
					<span className="text-center text-muted-foreground">
						<Trans>
							This is taking longer than usual. The chat below is its last saved
							copy; it opens for real once the workspace starts.
						</Trans>
					</span>
				)}
			</div>
		</div>
	);
}
