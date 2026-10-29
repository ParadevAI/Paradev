import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
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
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const OTHER_REPOSITORY = "__other__";
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;

interface AddPluginSourceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AddPluginSourceDialog({
	open,
	onOpenChange,
}: AddPluginSourceDialogProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const [repo, setRepo] = useState("");
	const [typedRepo, setTypedRepo] = useState("");
	const [ref, setRef] = useState("");
	const [path, setPath] = useState("");

	const enabled = open && Boolean(organizationId);
	const installationQuery =
		cloudTrpc.integration.github.getInstallation.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled },
		);
	const repositoriesQuery =
		cloudTrpc.integration.github.listRepositories.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled },
		);
	const repositories = [...(repositoriesQuery.data ?? [])].sort((a, b) =>
		a.fullName.localeCompare(b.fullName),
	);
	const appRepositories =
		installationQuery.isPending ||
		repositoriesQuery.isPending ||
		repositories.length > 0;
	const typing = !appRepositories || repo === OTHER_REPOSITORY;
	const chosenRepo = typing ? typedRepo.trim() : repo;
	const repoIsValid = REPOSITORY_PATTERN.test(chosenRepo);

	const reset = () => {
		setRepo("");
		setTypedRepo("");
		setRef("");
		setPath("");
	};

	const addMutation = cloudTrpc.plugins.organization.sources.add.useMutation({
		onSuccess: ({ repo: added }) => {
			toast.success(t({ message: `Added ${added}` }), {
				description: t({
					message: "Its plugins appear when the sync finishes.",
				}),
			});
			reset();
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error(t({ message: "Could not add repository" }), {
				description: errorMessage(error),
			});
		},
		onSettled: () =>
			Promise.all([
				utils.plugins.organization.sources.list.invalidate(),
				utils.plugins.organization.list.invalidate(),
			]),
	});

	const submit = () => {
		if (!repoIsValid) return;
		addMutation.mutate({
			repo: chosenRepo,
			ref: ref.trim() || undefined,
			path: path.trim() || undefined,
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>Add repository</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Pick a repository with a plugin marketplace file. Superset syncs
							its plugins now and each time you sync again.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<Label htmlFor="plugin-source-repo">
							<Trans>Repository</Trans>
						</Label>
						{appRepositories && (
							<Select value={repo} onValueChange={setRepo}>
								<SelectTrigger id="plugin-source-repo" className="w-full">
									<SelectValue
										placeholder={
											repositoriesQuery.isPending
												? t({ message: "Loading repositories..." })
												: t({ message: "Select a repository" })
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{repositories.map((repository) => (
										<SelectItem key={repository.id} value={repository.fullName}>
											{repository.fullName}
										</SelectItem>
									))}
									<SelectItem value={OTHER_REPOSITORY}>
										<Trans>Another repository...</Trans>
									</SelectItem>
								</SelectContent>
							</Select>
						)}
						{typing && (
							<>
								<Input
									id={appRepositories ? undefined : "plugin-source-repo"}
									placeholder="owner/name"
									value={typedRepo}
									onChange={(event) => setTypedRepo(event.target.value)}
								/>
								<p className="text-xs text-muted-foreground">
									<Trans>
										Superset reads it with your connected GitHub account.
										Connect one in{" "}
										<Link
											to="/settings/integrations"
											className="text-primary hover:underline"
											onClick={() => onOpenChange(false)}
										>
											Settings › Integrations
										</Link>{" "}
										if you have not yet.
									</Trans>
								</p>
							</>
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="plugin-source-ref">
							<Trans>Branch or tag (optional)</Trans>
						</Label>
						<Input
							id="plugin-source-ref"
							placeholder={t({ message: "Default branch" })}
							value={ref}
							onChange={(event) => setRef(event.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="plugin-source-path">
							<Trans>Path (optional)</Trans>
						</Label>
						<Input
							id="plugin-source-path"
							placeholder={t({ message: "Repository root" })}
							value={path}
							onChange={(event) => setPath(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") submit();
							}}
						/>
						<p className="text-xs text-muted-foreground">
							<Trans>
								The folder that holds the marketplace file, if it is not at the
								root.
							</Trans>
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						onClick={submit}
						disabled={!repoIsValid || addMutation.isPending}
					>
						{addMutation.isPending ? (
							<Trans>Adding...</Trans>
						) : (
							<Trans>Add repository</Trans>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
