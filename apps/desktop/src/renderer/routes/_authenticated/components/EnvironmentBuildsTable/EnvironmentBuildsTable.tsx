import { Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { EnvironmentBuildStatus } from "renderer/routes/_authenticated/components/EnvironmentBuildStatus";
import {
	BUILD_TRIGGER_LABELS,
	type EnvironmentBuild,
} from "renderer/routes/_authenticated/utils/environmentBuildMeta";

interface EnvironmentBuildsTableProps {
	builds: readonly EnvironmentBuild[];
}

export function EnvironmentBuildsTable({
	builds,
}: EnvironmentBuildsTableProps) {
	const { i18n } = useLingui();
	return (
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
					</TableRow>
				</TableHeader>
				<TableBody>
					{builds.length === 0 ? (
						<TableRow>
							<TableCell
								className="py-6 text-center text-sm text-muted-foreground"
								colSpan={4}
							>
								<Trans>No builds yet</Trans>
							</TableCell>
						</TableRow>
					) : (
						builds.map((build) => (
							<TableRow key={build.id}>
								<TableCell className="truncate font-mono text-xs">
									{build.id.slice(0, 8)}
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
								<TableCell className="text-muted-foreground">
									{formatDateTime(new Date(build.startedAt))}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
