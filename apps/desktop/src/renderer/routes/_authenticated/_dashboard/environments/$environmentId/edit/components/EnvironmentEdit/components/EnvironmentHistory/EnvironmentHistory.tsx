import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDateTime } from "@superset/i18n/format";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Table, TableBody, TableCell, TableRow } from "@superset/ui/table";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const HISTORY_SCAN = 50;

interface EnvironmentHistoryProps {
	environmentId: string;
}

/** The kept snapshots: the one workspaces start from, and the ones that can be restored. */
export function EnvironmentHistory({ environmentId }: EnvironmentHistoryProps) {
	const utils = cloudTrpc.useUtils();
	const builds = cloudTrpc.environment.builds.useQuery({
		environmentId,
		limit: HISTORY_SCAN,
	});
	const restore = cloudTrpc.environment.restore.useMutation({
		onSuccess: () => utils.environment.invalidate(),
		onError: (error) => toast.error(errorMessage(error)),
	});
	const kept =
		builds.data?.builds.filter((build) => build.active || build.restorable) ??
		[];

	return (
		<section className="space-y-3">
			<div>
				<h3 className="text-base font-semibold">
					<Trans>Environment history</Trans>
				</h3>
				<p className="mt-0.5 text-xs text-muted-foreground">
					<Trans>
						The last 5 environments. Restore one to start new workspaces from it
						again.
					</Trans>
				</p>
			</div>
			<div className="overflow-hidden rounded-md border">
				<Table>
					<TableBody>
						{kept.length === 0 ? (
							<TableRow>
								<TableCell className="py-6 text-center text-sm text-muted-foreground">
									<Trans>No environments built yet</Trans>
								</TableCell>
							</TableRow>
						) : (
							kept.map((build) => (
								<TableRow key={build.id}>
									<TableCell>
										{formatDateTime(
											new Date(build.finishedAt ?? build.startedAt),
										)}
									</TableCell>
									<TableCell className="font-mono text-xs text-muted-foreground">
										{build.trigger === "promote" ? (
											<Trans>Saved from a workspace</Trans>
										) : (
											build.commitSha?.slice(0, 7)
										)}
									</TableCell>
									<TableCell className="text-right">
										{build.active ? (
											<Badge className="font-normal" variant="outline">
												<Trans>Current</Trans>
											</Badge>
										) : (
											<Button
												className="h-7"
												disabled={restore.isPending}
												onClick={() =>
													restore.mutate({ environmentId, buildId: build.id })
												}
												size="sm"
												variant="outline"
											>
												<Trans>Restore</Trans>
											</Button>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}
