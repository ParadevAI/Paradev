import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { EnvironmentHistoryTable } from "./components/EnvironmentHistoryTable";
import { historyRows } from "./utils/historyRows";

const HISTORY_SCAN = 50;
const RECENT_BUILDS = 5;
const BUILD_POLL_MS = 5_000;

interface EnvironmentHistoryProps {
	environmentId: string;
}

export function EnvironmentHistory({ environmentId }: EnvironmentHistoryProps) {
	const utils = cloudTrpc.useUtils();
	const builds = cloudTrpc.environment.builds.useQuery(
		{ environmentId, limit: HISTORY_SCAN },
		{
			refetchInterval: (query) =>
				query.state.data?.builds.some((build) => build.status === "running")
					? BUILD_POLL_MS
					: false,
		},
	);
	const rebuild = cloudTrpc.environment.rebuild.useMutation({
		onSuccess: () => utils.environment.invalidate(),
		onError: (error) => toast.error(errorMessage(error)),
	});
	const restore = cloudTrpc.environment.restore.useMutation({
		onSuccess: () => utils.environment.invalidate(),
		onError: (error) => toast.error(errorMessage(error)),
	});
	const all = builds.data?.builds ?? [];
	const running = all.some((build) => build.status === "running");
	const wasRunning = useRef(running);
	useEffect(() => {
		if (wasRunning.current && !running) void utils.environment.invalidate();
		wasRunning.current = running;
	}, [running, utils]);

	return (
		<div>
			<div className="mb-1 flex items-center justify-between gap-4">
				<span className="text-xs font-medium">
					<Trans>Environment history</Trans>
				</span>
				<Button
					disabled={running || rebuild.isPending}
					onClick={() => rebuild.mutate({ environmentId })}
					size="xs"
					variant="outline"
				>
					{running ? (
						<Trans>Building…</Trans>
					) : (
						<Trans>Rebuild environment</Trans>
					)}
				</Button>
			</div>
			<p className="mb-2 text-xs text-muted-foreground">
				<Trans>
					Each successful build saves a snapshot. New workspaces start from the
					current one, and you can restore an earlier one.
				</Trans>
			</p>
			<EnvironmentHistoryTable
				builds={historyRows(all, RECENT_BUILDS)}
				failed={builds.isError}
				loading={builds.isPending}
				onRestore={(buildId) => restore.mutate({ environmentId, buildId })}
				restoring={restore.isPending}
			/>
		</div>
	);
}
