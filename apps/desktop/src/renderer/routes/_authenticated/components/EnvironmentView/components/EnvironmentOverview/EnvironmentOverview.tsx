import { Trans } from "@lingui/react/macro";
import { formatDateTime, formatRelativeTime } from "@superset/i18n/format";
import { SANDBOX_REGIONS } from "@superset/shared/sandbox-regions";
import type { RouterOutputs } from "@superset/trpc";
import type { ReactNode } from "react";
import { FaGithub } from "react-icons/fa";
import { EnvironmentBuildStatus } from "renderer/routes/_authenticated/components/EnvironmentBuildStatus";
import type { EnvironmentBuild } from "renderer/routes/_authenticated/utils/environmentBuildMeta";
import { EnvironmentProjectLinks } from "./components/EnvironmentProjectLinks";

type Environment = RouterOutputs["environment"]["get"];

interface EnvironmentOverviewProps {
	environment: Environment;
	activeBuild: EnvironmentBuild | null;
}

function Cell({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="min-w-0 px-4 py-3">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 flex min-h-5 min-w-0 flex-wrap items-center gap-1.5 text-sm">
				{children}
			</div>
		</div>
	);
}

export function EnvironmentOverview({
	environment,
	activeBuild,
}: EnvironmentOverviewProps) {
	const region =
		SANDBOX_REGIONS.find((option) => option.id === environment.region)?.city ??
		environment.region;
	const builtAt = activeBuild?.finishedAt ?? activeBuild?.startedAt;

	return (
		<section className="space-y-3">
			<h3 className="text-base font-semibold">
				<Trans>Overview</Trans>
			</h3>
			<div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card/50 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(even)]:border-l">
				<Cell label={<Trans>Repositories</Trans>}>
					<div className="flex min-w-0 flex-col gap-1">
						{environment.repositories.map((repository, index) => (
							<span
								className="inline-flex min-w-0 items-center gap-2"
								key={repository.id}
							>
								<FaGithub className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="truncate">{repository.fullName}</span>
								{index === 0 && (
									<span className="text-[11px] text-muted-foreground">
										<Trans>primary</Trans>
									</span>
								)}
							</span>
						))}
					</div>
				</Cell>
				<Cell label={<Trans>Projects</Trans>}>
					<EnvironmentProjectLinks
						environmentId={environment.id}
						projectIds={environment.projectIds}
						repositories={environment.repositories}
					/>
				</Cell>
				<Cell label={<Trans>Visible to</Trans>}>
					{environment.scope === "personal" ? (
						<Trans>Only you</Trans>
					) : (
						<Trans>Organization</Trans>
					)}
				</Cell>
				<Cell label={<Trans>Active build status</Trans>}>
					{environment.sourceKind === "fork" ? (
						<>
							<EnvironmentBuildStatus status="succeeded" />
							{builtAt && (
								<span className="text-muted-foreground">
									· {formatRelativeTime(new Date(builtAt))}
								</span>
							)}
						</>
					) : (
						<span className="text-muted-foreground">
							<Trans>No build yet</Trans>
						</span>
					)}
				</Cell>
				<Cell label={<Trans>Region</Trans>}>{region}</Cell>
				<Cell label={<Trans>Updated</Trans>}>
					{formatDateTime(new Date(environment.updatedAt))}
				</Cell>
			</div>
		</section>
	);
}
