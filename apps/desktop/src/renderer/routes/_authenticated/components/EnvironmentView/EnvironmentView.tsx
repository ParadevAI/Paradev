import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuArchive, LuEllipsis, LuPencil } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ArchiveEnvironmentDialog } from "../ArchiveEnvironmentDialog";
import { EnvironmentVariablesPreview } from "../EnvironmentVariablesPreview";
import { EnvironmentBuilds } from "./components/EnvironmentBuilds";
import { EnvironmentOverview } from "./components/EnvironmentOverview";

const BUILDS_SHOWN = 5;
const BUILD_POLL_MS = 5_000;

interface EnvironmentViewProps {
	environmentId: string;
	onArchived?: () => void;
}

export function EnvironmentView({
	environmentId,
	onArchived,
}: EnvironmentViewProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const environment = cloudTrpc.environment.get.useQuery({
		id: environmentId,
	});
	const builds = cloudTrpc.environment.builds.useQuery(
		{ environmentId, limit: BUILDS_SHOWN },
		{
			refetchInterval: (query) =>
				query.state.data?.builds.some((build) => build.status === "running")
					? BUILD_POLL_MS
					: false,
		},
	);
	const [confirmingArchive, setConfirmingArchive] = useState(false);
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
			<div className="flex flex-col gap-3 p-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}
	if (!environment.data) {
		return (
			<div className="p-6 text-sm text-muted-foreground">
				{environment.error ? (
					errorMessage(environment.error)
				) : (
					<Trans>Environment not found</Trans>
				)}
			</div>
		);
	}

	const row = environment.data;
	const buildRows = builds.data?.builds ?? [];
	const openEdit = (search?: { focus: "name" }) =>
		navigate({
			to: "/environments/$environmentId/edit",
			params: { environmentId },
			search,
		});

	return (
		<div className="flex flex-col gap-10 p-6">
			<header className="flex items-center justify-between gap-4">
				<h2 className="truncate text-xl font-semibold">{row.name}</h2>
				<div className="flex shrink-0 items-center gap-2">
					<Button className="h-8" onClick={() => openEdit()} size="sm">
						<LuPencil className="size-3.5" />
						<Trans>Edit</Trans>
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label={t({ message: "More actions" })}
								className="size-8"
								size="icon"
								variant="outline"
							>
								<LuEllipsis className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem onSelect={() => openEdit({ focus: "name" })}>
								<Trans>Rename</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onSelect={() => setConfirmingArchive(true)}
							>
								<LuArchive className="size-3.5" />
								<Trans>Archive</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>

			<EnvironmentOverview
				activeBuild={buildRows.find((build) => build.active) ?? null}
				environment={row}
			/>
			<EnvironmentBuilds builds={buildRows} environmentId={environmentId} />
			<EnvironmentVariablesPreview environmentId={environmentId} />

			<ArchiveEnvironmentDialog
				environmentName={confirmingArchive ? row.name : null}
				onConfirm={() => archive.mutate({ id: row.id })}
				onOpenChange={setConfirmingArchive}
			/>
		</div>
	);
}
