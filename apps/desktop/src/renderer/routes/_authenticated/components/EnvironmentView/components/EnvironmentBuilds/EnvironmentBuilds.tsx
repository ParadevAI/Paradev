import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { LuArrowUpRight } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { EnvironmentBuildsTable } from "renderer/routes/_authenticated/components/EnvironmentBuildsTable";
import type { EnvironmentBuild } from "renderer/routes/_authenticated/utils/environmentBuildMeta";

interface EnvironmentBuildsProps {
	environmentId: string;
	builds: readonly EnvironmentBuild[];
}

export function EnvironmentBuilds({
	environmentId,
	builds,
}: EnvironmentBuildsProps) {
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const rebuild = cloudTrpc.environment.rebuild.useMutation({
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
				<div className="flex items-center gap-2">
					<Button
						className="h-8 gap-1.5 px-3 text-muted-foreground hover:text-foreground"
						onClick={() =>
							navigate({
								to: "/environments/$environmentId/builds",
								params: { environmentId },
							})
						}
						size="sm"
						variant="ghost"
					>
						<Trans>All builds</Trans>
						<LuArrowUpRight className="size-3.5" />
					</Button>
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
							<Trans>Trigger new build</Trans>
						)}
					</Button>
				</div>
			</div>
			<EnvironmentBuildsTable builds={builds} />
		</section>
	);
}
