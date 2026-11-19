import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDateTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	BUILD_TRIGGER_LABELS,
	type EnvironmentBuild,
} from "../../utils/environmentBuildMeta";
import { EnvironmentBuildStatus } from "../EnvironmentBuildStatus";
import { BuildIdCell } from "./components/BuildIdCell";

interface EnvironmentBuildsProps {
	environmentId: string;
	builds: readonly EnvironmentBuild[];
}

export function EnvironmentBuilds({
	environmentId,
	builds,
}: EnvironmentBuildsProps) {
	const { i18n } = useLingui();
	const utils = cloudTrpc.useUtils();
	const rebuild = cloudTrpc.environment.rebuild.useMutation({
		onSuccess: () => utils.environment.invalidate(),
		onError: (error) => toast.error(errorMessage(error)),
	});
	const restore = cloudTrpc.environment.restore.useMutation({
		onSuccess: () => utils.environment.invalidate(),
		onError: (error) => toast.error(errorMessage(error)),
	});
	const running = builds.some((build) => build.status === "running");

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between gap-4">
				<h3 className="text-base font-semibold">
					<Trans>Builds</Trans>
				</h3>
				<Button
					className="h-8"
					disabled={running || rebuild.isPending}
					onClick={() => rebuild.mutate({ environmentId })}
					size="sm"
					variant="outline"
				>
					{running ? (
						<Trans>Building…</Trans>
					) : (
						<Trans>Rebuild environment</Trans>
					)}
				</Button>
			</div>
			<div className="overflow-hidden rounded-md border">
				<Table className="table-fixed">
					<TableHeader>
						<TableRow>
							<TableHead>
								<Trans>Build ID</Trans>
							</TableHead>
							<TableHead>
								<Trans>Type</Trans>
							</TableHead>
							<TableHead>
								<Trans>Status</Trans>
							</TableHead>
							<TableHead>
								<Trans>Started</Trans>
							</TableHead>
							<TableHead className="w-28" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{builds.length === 0 ? (
							<TableRow>
								<TableCell
									className="py-6 text-center text-sm text-muted-foreground"
									colSpan={5}
								>
									<Trans>No builds yet</Trans>
								</TableCell>
							</TableRow>
						) : (
							builds.map((build) => (
								<TableRow key={build.id}>
									<BuildIdCell buildId={build.id} />
									<TableCell>
										{i18n._(BUILD_TRIGGER_LABELS[build.trigger])}
									</TableCell>
									<TableCell>
										<EnvironmentBuildStatus
											error={build.error}
											status={build.status}
										/>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{formatDateTime(new Date(build.startedAt))}
									</TableCell>
									<TableCell className="text-right">
										{build.active ? (
											<span className="pr-3 text-sm text-muted-foreground">
												<Trans>Current</Trans>
											</span>
										) : build.restorable ? (
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
										) : null}
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
