import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatRelativeTime } from "@superset/i18n/format";
import { SANDBOX_REGIONS } from "@superset/shared/sandbox-regions";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { LuArchive, LuContainer } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ArchiveEnvironmentDialog } from "../ArchiveEnvironmentDialog";
import { EnvironmentPropertyRow } from "../EnvironmentPropertyRow";
import { EnvironmentProjectLinks } from "./components/EnvironmentProjectLinks";
import { EnvironmentVariables } from "./components/EnvironmentVariables";

type EnvironmentScope = "organization" | "personal";

const ROW_CONTROL =
	"h-10 w-full rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent";

interface EnvironmentViewProps {
	environmentId: string;
	onArchived?: () => void;
}

export function EnvironmentView({
	environmentId,
	onArchived,
}: EnvironmentViewProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const environment = cloudTrpc.environment.get.useQuery({
		id: environmentId,
	});
	const secrets = cloudTrpc.environment.secrets.list.useQuery({
		environmentId,
	});
	const [confirmingArchive, setConfirmingArchive] = useState(false);

	const update = cloudTrpc.environment.update.useMutation({
		onSuccess: async () => {
			await utils.environment.invalidate();
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const archive = cloudTrpc.environment.archive.useMutation({
		onSuccess: async () => {
			await utils.environment.list.invalidate();
			toast.success(t({ message: "Environment archived" }));
			onArchived?.();
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	if (environment.isLoading) {
		return (
			<div className="flex flex-col gap-3 p-4">
				<Skeleton className="h-9 w-48" />
				<Skeleton className="h-40 w-full" />
			</div>
		);
	}
	if (!environment.data) {
		return (
			<div className="p-4 text-sm text-muted-foreground">
				{environment.error ? (
					errorMessage(environment.error)
				) : (
					<Trans>Environment not found</Trans>
				)}
			</div>
		);
	}

	const row = environment.data;
	const region =
		SANDBOX_REGIONS.find((option) => option.id === row.region)?.city ??
		row.region;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
			<div className="flex items-start gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
					<LuContainer className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<span className="truncate">{row.name}</span>
						{row.scope === "personal" && (
							<Badge
								variant="outline"
								className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
							>
								<Trans>Only you</Trans>
							</Badge>
						)}
					</div>
					<div className="mt-0.5 text-xs text-muted-foreground">
						<Trans>Created {formatRelativeTime(new Date(row.createdAt))}</Trans>
					</div>
				</div>
			</div>

			<div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70">
				<EnvironmentPropertyRow
					htmlFor="environment-view-scope"
					label={<Trans>Visible to</Trans>}
				>
					<Select
						disabled={update.isPending}
						onValueChange={(scope) =>
							update.mutate({ id: row.id, scope: scope as EnvironmentScope })
						}
						value={row.scope}
					>
						<SelectTrigger className={ROW_CONTROL} id="environment-view-scope">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="organization">
								<Trans>Organization</Trans>
							</SelectItem>
							<SelectItem value="personal">
								<Trans>Only you</Trans>
							</SelectItem>
						</SelectContent>
					</Select>
				</EnvironmentPropertyRow>
				<EnvironmentPropertyRow
					htmlFor="environment-view-region"
					label={<Trans>Region</Trans>}
				>
					<span className="px-3 text-sm" id="environment-view-region">
						{region}
					</span>
				</EnvironmentPropertyRow>
				<EnvironmentPropertyRow
					htmlFor="environment-view-repositories"
					label={<Trans>Repositories</Trans>}
				>
					<div
						className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 px-2 py-2"
						id="environment-view-repositories"
					>
						{row.repositories.map((repository, index) => (
							<span
								className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-muted/60 px-2 text-xs"
								key={repository.id}
							>
								<FaGithub className="size-3 shrink-0 text-muted-foreground" />
								<span className="truncate">{repository.fullName}</span>
								{index === 0 && (
									<span className="text-[10px] text-muted-foreground">
										<Trans>primary</Trans>
									</span>
								)}
							</span>
						))}
					</div>
				</EnvironmentPropertyRow>
				<EnvironmentPropertyRow
					htmlFor="environment-view-projects"
					label={<Trans>Projects</Trans>}
				>
					<EnvironmentProjectLinks
						environmentId={row.id}
						id="environment-view-projects"
						projectIds={row.projectIds}
						repositories={row.repositories}
					/>
				</EnvironmentPropertyRow>
				<EnvironmentPropertyRow
					htmlFor="environment-view-snapshot"
					label={<Trans>Snapshot</Trans>}
				>
					<span
						className="px-3 text-sm text-muted-foreground"
						id="environment-view-snapshot"
					>
						{row.sourceKind === "fork" ? (
							<Trans>
								Checkpoint saved {formatRelativeTime(new Date(row.updatedAt))}
							</Trans>
						) : (
							<Trans>Base image · no checkpoint yet</Trans>
						)}
					</span>
				</EnvironmentPropertyRow>
			</div>

			<EnvironmentVariables
				isLoading={secrets.isLoading}
				variables={secrets.data ?? []}
			/>

			<div className="mt-auto pt-2">
				<Button
					className="text-muted-foreground"
					onClick={() => setConfirmingArchive(true)}
					size="xs"
					variant="ghost"
				>
					<LuArchive className="size-3.5" />
					<Trans>Archive environment</Trans>
				</Button>
			</div>
			<ArchiveEnvironmentDialog
				environmentName={confirmingArchive ? row.name : null}
				onConfirm={() => archive.mutate({ id: row.id })}
				onOpenChange={setConfirmingArchive}
			/>
		</div>
	);
}
