import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { isCloudUsageRefusal } from "@superset/shared/billing";
import { ENVIRONMENT_ONBOARDING_PROMPT } from "@superset/shared/cloud-agent-launch";
import {
	DEFAULT_SANDBOX_REGION,
	SANDBOX_REGIONS,
	type SandboxRegionId,
} from "@superset/shared/sandbox-regions";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { githubAppSettingsUrl } from "renderer/lib/github/githubAppSettingsUrl";
import { EnvironmentMissingRepositoryNotice } from "./components/EnvironmentMissingRepositoryNotice";
import { EnvironmentPropertyRow } from "./components/EnvironmentPropertyRow";
import { EnvironmentRepositoryPicker } from "./components/EnvironmentRepositoryPicker";

type EnvironmentScope = "organization" | "personal";

export interface EnvironmentEditorSeed {
	id: string;
	name: string;
	scope: EnvironmentScope;
	repositoryIds: string[];
	hooksRepositoryId: string | null;
	/** A promoted environment's golden was built for its repositories. */
	repositoriesFrozen: boolean;
	region: string;
}

interface EnvironmentEditorDialogProps {
	organizationId: string;
	/** Absent for a new environment. */
	environment?: EnvironmentEditorSeed;
	/** Saves this cloud workspace as a new environment; its repositories and region come with it. */
	fromWorkspaceId?: string;
	/** Preselects this repository (`owner/name`) in a new environment once the list loads. */
	initialRepositoryFullName?: string;
	initialName?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The caller continues with the saved environment, so the editor offers no agent setup. */
	onCreated?: (environmentId: string) => void;
}

const NO_HOOKS = "none";

/**
 * One property list: repository, name, region and visibility, prefilled so a
 * new environment needs nothing but the create button. Config location shows
 * once there is more than one repository to choose between. From Settings, a
 * new environment can also be handed to an agent that installs what the
 * project needs.
 */
export function EnvironmentEditorDialog({
	organizationId,
	environment,
	fromWorkspaceId,
	initialRepositoryFullName,
	initialName,
	open,
	onOpenChange,
	onCreated,
}: EnvironmentEditorDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const isCreating = !environment && !fromWorkspaceId;
	const preview = cloudTrpc.environment.promotePreview.useQuery(
		{ cloudWorkspaceId: fromWorkspaceId ?? "" },
		{ enabled: open && fromWorkspaceId !== undefined },
	);
	const [nameDraft, setName] = useState<string | null>(
		environment?.name ?? initialName ?? null,
	);
	const [repositoryIdsDraft, setRepositoryIds] = useState<string[] | null>(
		environment?.repositoryIds ?? null,
	);
	// Undefined until chosen: the config location follows the first repository.
	const [hooksDraft, setHooksDraft] = useState<string | null | undefined>(
		environment ? environment.hooksRepositoryId : undefined,
	);
	const [scopeDraft, setScope] = useState<EnvironmentScope | null>(
		environment?.scope ?? null,
	);
	const scope = scopeDraft ?? preview.data?.scope ?? "organization";
	const [region, setRegion] = useState<SandboxRegionId | null>(null);
	// Region and visibility are decided for a new environment; editing shows them.
	const [isAdvanced, setIsAdvanced] = useState(!isCreating);
	const suggestedRegion = cloudTrpc.environment.suggestRegion.useQuery(
		undefined,
		{ enabled: open && isCreating },
	);
	const chosenRegion =
		region ?? suggestedRegion.data?.region ?? DEFAULT_SANDBOX_REGION;
	const shownRegion =
		environment?.region ?? preview.data?.region ?? chosenRegion;
	const repositoriesFrozen =
		(environment?.repositoriesFrozen ?? false) || fromWorkspaceId !== undefined;

	const repositoriesQuery =
		cloudTrpc.integration.github.listRepositories.useQuery(
			{ organizationId },
			{ enabled: open && !fromWorkspaceId },
		);
	const repositories = repositoriesQuery.data ?? [];
	const seededRepositoryId = initialRepositoryFullName
		? repositories.find(
				(repo) =>
					repo.fullName.toLowerCase() ===
					initialRepositoryFullName.toLowerCase(),
			)?.id
		: undefined;
	const repositoryIds =
		repositoryIdsDraft ?? (seededRepositoryId ? [seededRepositoryId] : []);
	const selectedRepositories: { id: string; fullName: string }[] = preview.data
		? preview.data.repositories
		: repositoryIds
				.map((id) => repositories.find((repo) => repo.id === id))
				.filter((repo): repo is (typeof repositories)[number] => !!repo);
	const name =
		nameDraft ??
		preview.data?.name ??
		selectedRepositories[0]?.fullName.split("/").pop() ??
		"";

	const installationQuery =
		cloudTrpc.integration.github.getInstallation.useQuery(
			{ organizationId },
			{ enabled: open && !fromWorkspaceId },
		);
	const installation = installationQuery.data;
	const appSettingsUrl = installation?.installationId
		? githubAppSettingsUrl(installation)
		: null;
	const missingRepositoryFullName =
		initialRepositoryFullName &&
		repositoriesQuery.isSuccess &&
		!seededRepositoryId &&
		repositoryIdsDraft === null
			? initialRepositoryFullName
			: null;
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const [isAwaitingGitHub, setIsAwaitingGitHub] = useState(false);
	const configureGitHubApp = appSettingsUrl
		? () => {
				openUrl.mutate(appSettingsUrl);
				setIsAwaitingGitHub(true);
			}
		: null;
	// Access granted on GitHub reaches the list by webhook; look again when the
	// user comes back to the app.
	useEffect(() => {
		if (!isAwaitingGitHub || !open) return;
		const refetch = () => {
			void utils.integration.github.listRepositories.invalidate({
				organizationId,
			});
		};
		window.addEventListener("focus", refetch);
		return () => window.removeEventListener("focus", refetch);
	}, [isAwaitingGitHub, open, organizationId, utils]);

	const hooksChoice = preview.data
		? (preview.data.repositories.find((repo) => repo.hooks)?.id ?? NO_HOOKS)
		: hooksDraft === undefined
			? (repositoryIds[0] ?? NO_HOOKS)
			: hooksDraft && repositoryIds.includes(hooksDraft)
				? hooksDraft
				: NO_HOOKS;

	const toggleRepository = (repositoryId: string) =>
		setRepositoryIds(
			repositoryIds.includes(repositoryId)
				? repositoryIds.filter((id) => id !== repositoryId)
				: [...repositoryIds, repositoryId],
		);

	const resync = cloudTrpc.integration.github.triggerSync.useMutation({
		onSuccess: async () => {
			await utils.integration.github.listRepositories.invalidate();
			toast.success(t({ message: "Repositories refreshed" }));
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	const create = cloudTrpc.environment.create.useMutation();
	const update = cloudTrpc.environment.update.useMutation();
	const createWorkspace = cloudTrpc.cloudWorkspace.create.useMutation();
	const promote = cloudTrpc.environment.promote.useMutation();
	const busy =
		create.isPending || update.isPending || createWorkspace.isPending;
	const valid =
		name.trim().length > 0 &&
		(fromWorkspaceId ? preview.isSuccess : repositoryIds.length > 0);

	const body = () => ({
		name: name.trim(),
		repositoryIds,
		hooksRepositoryId: hooksChoice === NO_HOOKS ? null : hooksChoice,
		scope,
	});

	const save = async () => {
		if (environment) {
			await update.mutateAsync({ id: environment.id, ...body() });
			return environment.id;
		}
		const row = await create.mutateAsync({
			organizationId,
			...body(),
			region: chosenRegion,
		});
		return row.id;
	};

	const finish = async () => {
		await utils.environment.list.invalidate();
		onOpenChange(false);
	};

	const onSave = async () => {
		try {
			const environmentId = await save();
			toast.success(
				environment
					? t({ message: "Environment saved" })
					: t({ message: "Environment created" }),
			);
			await finish();
			if (!environment) onCreated?.(environmentId);
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	const onPromote = (cloudWorkspaceId: string) => {
		onOpenChange(false);
		toast.promise(
			promote
				.mutateAsync({ cloudWorkspaceId, name: name.trim(), scope })
				.then(async (created) => {
					await utils.environment.list.invalidate();
					return created;
				}),
			{
				loading: t({ message: "Saving as an environment..." }),
				success: (created) =>
					t({
						message: `Saved "${created?.name ?? name.trim()}" as an environment`,
					}),
				error: (error) => errorMessage(error),
			},
		);
	};

	const onStartAgent = async () => {
		try {
			const environmentId = await save();
			const created = await createWorkspace.mutateAsync({
				organizationId,
				environmentId,
				name: t({ message: `Set up ${name.trim()}` }),
				prompt: ENVIRONMENT_ONBOARDING_PROMPT,
				agent: "claude",
			});
			const listInput = { organizationId };
			await utils.cloudWorkspace.list.cancel(listInput);
			utils.cloudWorkspace.list.setData(listInput, (rows) =>
				rows ? [created, ...rows] : [created],
			);
			await finish();
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: created.id },
			});
		} catch (error) {
			toast.error(
				errorMessage(error),
				isCloudUsageRefusal(error)
					? {
							action: {
								label: t({ message: "Open billing" }),
								onClick: () => {
									void navigate({ to: "/settings/billing" });
								},
							},
						}
					: undefined,
			);
		}
	};

	const showsConfigLocation = !!environment || selectedRepositories.length > 1;
	const rowControl =
		"h-10 w-full rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent";

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[440px]">
				<DialogHeader className="px-5 pt-5 pb-3 text-left">
					<DialogTitle className="text-base leading-tight">
						{environment ? (
							<Trans>Edit environment</Trans>
						) : fromWorkspaceId ? (
							<Trans>Save as environment</Trans>
						) : (
							<Trans>New environment</Trans>
						)}
					</DialogTitle>
					{fromWorkspaceId && (
						<DialogDescription className="text-xs leading-snug">
							<Trans>
								Snapshots this workspace as it is now, with everything installed
								in it. New workspaces from the environment start from that
								snapshot.
							</Trans>
						</DialogDescription>
					)}
				</DialogHeader>

				<div className="flex flex-col gap-3 px-5 pb-5">
					<div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70">
						<EnvironmentPropertyRow
							htmlFor="environment-name"
							label={<Trans>Name</Trans>}
						>
							<Input
								className="h-10 w-full px-3 placeholder:text-muted-foreground"
								id="environment-name"
								onChange={(event) => setName(event.target.value)}
								placeholder={t({ message: "monorepo" })}
								value={name}
								variant="ghost"
							/>
						</EnvironmentPropertyRow>

						<EnvironmentPropertyRow
							htmlFor="environment-repositories"
							label={<Trans>Repositories</Trans>}
						>
							<EnvironmentRepositoryPicker
								disabled={repositoriesFrozen}
								isLoading={repositoriesQuery.isLoading}
								isRefreshing={resync.isPending}
								onConfigureGitHubApp={configureGitHubApp}
								onRefresh={
									fromWorkspaceId
										? null
										: () => resync.mutate({ organizationId })
								}
								onToggle={toggleRepository}
								repositories={repositories}
								selected={selectedRepositories}
							/>
						</EnvironmentPropertyRow>

						{isAdvanced && showsConfigLocation && (
							<EnvironmentPropertyRow
								htmlFor="environment-hooks"
								label={<Trans>Opens on</Trans>}
							>
								<Select
									disabled={fromWorkspaceId !== undefined}
									onValueChange={(value) =>
										setHooksDraft(value === NO_HOOKS ? null : value)
									}
									value={hooksChoice}
								>
									<SelectTrigger className={rowControl} id="environment-hooks">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_HOOKS}>
											<Trans>First repository by name</Trans>
										</SelectItem>
										{selectedRepositories.map((repo) => (
											<SelectItem key={repo.id} value={repo.id}>
												{repo.fullName}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</EnvironmentPropertyRow>
						)}

						{isAdvanced && (
							<>
								<EnvironmentPropertyRow
									htmlFor="environment-region"
									label={<Trans>Region</Trans>}
								>
									<Select
										disabled={!isCreating}
										onValueChange={(value) =>
											setRegion(value as SandboxRegionId)
										}
										value={shownRegion}
									>
										<SelectTrigger
											className={rowControl}
											id="environment-region"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{SANDBOX_REGIONS.map((option) => (
												<SelectItem key={option.id} value={option.id}>
													{option.city}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</EnvironmentPropertyRow>

								<EnvironmentPropertyRow
									htmlFor="environment-scope"
									label={<Trans>Visible to</Trans>}
								>
									<Select
										onValueChange={(value) =>
											setScope(value as EnvironmentScope)
										}
										value={scope}
									>
										<SelectTrigger
											className={rowControl}
											id="environment-scope"
										>
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
							</>
						)}
					</div>

					<button
						className="flex items-center gap-1 self-start px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
						onClick={() => setIsAdvanced((value) => !value)}
						type="button"
					>
						<HiChevronRight
							className={cn(
								"size-3 transition-transform",
								isAdvanced && "rotate-90",
							)}
						/>
						<Trans>Advanced</Trans>
					</button>

					{missingRepositoryFullName && (
						<EnvironmentMissingRepositoryNotice
							installedAccountLogin={installation?.accountLogin ?? null}
							onConfigureGitHubApp={configureGitHubApp}
							repositoryFullName={missingRepositoryFullName}
						/>
					)}
					{repositoriesFrozen && (
						<p className="text-xs leading-snug text-muted-foreground">
							{fromWorkspaceId ? (
								<Trans>
									The workspace's repositories, as they are checked out now.
									Boxes run in its region.
								</Trans>
							) : (
								<Trans>
									Promoted from a workspace, so its repositories and region are
									fixed. Promote a workspace again to change them.
								</Trans>
							)}
						</p>
					)}
				</div>

				<DialogFooter className="border-t border-border/70 bg-muted/20 px-5 py-3">
					<Button
						disabled={busy}
						onClick={() => onOpenChange(false)}
						size="sm"
						variant="ghost"
					>
						<Trans>Cancel</Trans>
					</Button>
					{environment ? (
						<Button disabled={!valid || busy} onClick={onSave} size="sm">
							<Trans>Save</Trans>
						</Button>
					) : fromWorkspaceId ? (
						<Button
							disabled={!valid}
							onClick={() => onPromote(fromWorkspaceId)}
							size="sm"
						>
							<Trans>Save environment</Trans>
						</Button>
					) : (
						<>
							{!onCreated && (
								<Button
									disabled={!valid || busy}
									onClick={onStartAgent}
									size="sm"
									title={t({
										message:
											"Opens a cloud workspace where an agent installs what the project needs and writes its .superset/config.json",
									})}
									variant="outline"
								>
									<Trans>Set up with an agent</Trans>
								</Button>
							)}
							<Button disabled={!valid || busy} onClick={onSave} size="sm">
								<Trans>Create environment</Trans>
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
