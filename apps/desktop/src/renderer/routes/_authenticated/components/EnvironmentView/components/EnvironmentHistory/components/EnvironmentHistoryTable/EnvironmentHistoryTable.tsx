import { Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import {
	BUILD_TRIGGER_LABELS,
	type EnvironmentBuild,
} from "renderer/routes/_authenticated/components/EnvironmentView/components/EnvironmentHistory/utils/environmentBuildMeta";
import { EnvironmentBuildStatus } from "./components/EnvironmentBuildStatus";

interface EnvironmentHistoryTableProps {
	builds: readonly EnvironmentBuild[];
	loading: boolean;
	failed: boolean;
	onRestore: (buildId: string) => void;
	restoring: boolean;
}

export function EnvironmentHistoryTable({
	builds,
	loading,
	failed,
	onRestore,
	restoring,
}: EnvironmentHistoryTableProps) {
	const { i18n } = useLingui();
	return (
		<div className="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>
							<Trans>Started</Trans>
						</TableHead>
						<TableHead>
							<Trans>Type</Trans>
						</TableHead>
						<TableHead>
							<Trans>Status</Trans>
						</TableHead>
						<TableHead>
							<Trans>Commit</Trans>
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
								{loading ? (
									<Trans>Loading</Trans>
								) : failed ? (
									<Trans>Couldn't load builds</Trans>
								) : (
									<Trans>No builds yet</Trans>
								)}
							</TableCell>
						</TableRow>
					) : (
						builds.map((build) => (
							<TableRow key={build.id}>
								<TableCell className="text-muted-foreground">
									{formatDateTime(new Date(build.startedAt))}
								</TableCell>
								<TableCell>
									{i18n._(BUILD_TRIGGER_LABELS[build.trigger])}
								</TableCell>
								<TableCell>
									<EnvironmentBuildStatus
										error={build.error}
										status={build.status}
									/>
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
										<span className="pr-3 text-sm text-muted-foreground">
											<Trans>Current</Trans>
										</span>
									) : build.restorable ? (
										<Button
											className="h-7"
											disabled={restoring}
											onClick={() => onRestore(build.id)}
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
	);
}
