import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { LuArchive, LuEllipsis } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ArchiveEnvironmentDialog } from "renderer/routes/_authenticated/components/ArchiveEnvironmentDialog";
import { CreateEnvironmentFlow } from "renderer/routes/_authenticated/components/CreateEnvironmentFlow";
import { EnvironmentVariablesPreview } from "renderer/routes/_authenticated/components/EnvironmentVariablesPreview";
import { SettingsRow } from "renderer/routes/_authenticated/settings/components/SettingsRow";
import { SettingsSection } from "renderer/routes/_authenticated/settings/components/SettingsSection";
import { EnvironmentHistory } from "./components/EnvironmentHistory";

type Scope = "organization" | "personal";

interface EnvironmentEditProps {
	environmentId: string;
	focusName: boolean;
	onArchived: () => void;
}

export function EnvironmentEdit({
	environmentId,
	focusName,
	onArchived,
}: EnvironmentEditProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const environment = cloudTrpc.environment.get.useQuery({ id: environmentId });
	const [name, setName] = useState("");
	const [scope, setScope] = useState<Scope>("organization");
	const [editingRepositories, setEditingRepositories] = useState(false);
	const [confirmingArchive, setConfirmingArchive] = useState(false);

	useEffect(() => {
		if (!environment.data) return;
		setName(environment.data.name);
		setScope(environment.data.scope);
	}, [environment.data]);

	const update = cloudTrpc.environment.update.useMutation({
		onSuccess: async () => {
			await utils.environment.invalidate();
			toast.success(t({ message: "Environment updated" }));
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const archive = cloudTrpc.environment.archive.useMutation({
		onSuccess: async () => {
			await utils.environment.list.invalidate();
			toast.success(t({ message: "Environment archived" }));
			onArchived();
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	if (!environment.data) {
		return (
			<div className="flex flex-col gap-3 p-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}
	const row = environment.data;
	const trimmed = name.trim();
	const changed =
		(trimmed.length > 0 && trimmed !== row.name) || scope !== row.scope;

	return (
		<div className="flex flex-col gap-10 p-6">
			<header className="flex items-center justify-between gap-4">
				<h2 className="truncate text-xl font-semibold">{row.name}</h2>
				<div className="flex shrink-0 items-center gap-2">
					<Button
						className="h-8"
						disabled={!changed || update.isPending}
						onClick={() =>
							update.mutate({
								id: row.id,
								...(trimmed !== row.name ? { name: trimmed } : {}),
								...(scope !== row.scope ? { scope } : {}),
							})
						}
						size="sm"
					>
						<Trans>Update environment</Trans>
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
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setConfirmingArchive(true)}
							>
								<LuArchive className="size-3.5" />
								<Trans>Archive</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>

			<SettingsSection title={t({ message: "General" })}>
				<div>
					<SettingsRow
						htmlFor="environment-name"
						label={t({ message: "Name" })}
					>
						<Input
							autoFocus={focusName}
							className="w-64"
							id="environment-name"
							maxLength={100}
							onChange={(event) => setName(event.target.value)}
							value={name}
						/>
					</SettingsRow>
					<SettingsRow
						htmlFor="environment-scope"
						label={t({ message: "Visible to" })}
					>
						<Select
							onValueChange={(value) => setScope(value as Scope)}
							value={scope}
						>
							<SelectTrigger className="w-64" id="environment-scope">
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
					</SettingsRow>
				</div>
			</SettingsSection>

			<SettingsSection
				action={
					<Button
						className="h-8"
						onClick={() => setEditingRepositories(true)}
						size="sm"
						variant="outline"
					>
						<Trans>Edit</Trans>
					</Button>
				}
				title={t({ message: "Repositories" })}
			>
				<div className="divide-y rounded-md border">
					{row.repositories.map((repository, index) => (
						<div
							className="flex h-10 items-center gap-2.5 px-3 text-sm"
							key={repository.id}
						>
							<FaGithub className="size-4 text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate">
								{repository.fullName}
							</span>
							{index === 0 && (
								<span className="text-[11px] text-muted-foreground">
									<Trans>primary</Trans>
								</span>
							)}
						</div>
					))}
				</div>
			</SettingsSection>

			<EnvironmentVariablesPreview environmentId={row.id} />
			<EnvironmentHistory environmentId={row.id} />

			<CreateEnvironmentFlow
				editing={{
					environmentId: row.id,
					repositoryIds: row.repositories.map((repository) => repository.id),
					primaryRepositoryId: row.repositories[0]?.id ?? null,
				}}
				onOpenChange={setEditingRepositories}
				open={editingRepositories}
				organizationId={row.organizationId}
			/>
			<ArchiveEnvironmentDialog
				environmentName={confirmingArchive ? row.name : null}
				onConfirm={() => archive.mutate({ id: row.id })}
				onOpenChange={setConfirmingArchive}
			/>
		</div>
	);
}
