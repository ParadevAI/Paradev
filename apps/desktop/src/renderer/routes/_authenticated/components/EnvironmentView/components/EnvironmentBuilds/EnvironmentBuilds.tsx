import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { EnvironmentBuildsTable } from "./components/EnvironmentBuildsTable";

const BUILDS_SHOWN = 5;
const BUILD_POLL_MS = 5_000;

interface EnvironmentBuildsProps {
	environmentId: string;
}

export function EnvironmentBuilds({ environmentId }: EnvironmentBuildsProps) {
	const utils = cloudTrpc.useUtils();
	const builds = cloudTrpc.environment.builds.useQuery(
		{ environmentId, limit: BUILDS_SHOWN },
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
	const rows = builds.data?.builds ?? [];
	const running = rows.some((build) => build.status === "running");

	return (
		<div>
			<div className="mb-2 flex items-center justify-between gap-4">
				<span className="text-xs font-medium">
					<Trans>Builds</Trans>
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
			<EnvironmentBuildsTable builds={rows} />
		</div>
	);
}
