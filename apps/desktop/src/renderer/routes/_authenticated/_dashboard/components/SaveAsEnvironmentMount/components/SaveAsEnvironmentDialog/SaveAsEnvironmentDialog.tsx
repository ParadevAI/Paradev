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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { EnvironmentPropertyRow } from "renderer/routes/_authenticated/components/EnvironmentPropertyRow";

type EnvironmentScope = "organization" | "personal";

const ROW_CONTROL =
	"h-10 w-full rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent";

interface SaveAsEnvironmentDialogProps {
	cloudWorkspaceId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Snapshots a cloud workspace into a new environment; its repositories and region come with it. */
export function SaveAsEnvironmentDialog({
	cloudWorkspaceId,
	open,
	onOpenChange,
}: SaveAsEnvironmentDialogProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const preview = cloudTrpc.environment.promotePreview.useQuery(
		{ cloudWorkspaceId },
		{ enabled: open },
	);
	const promote = cloudTrpc.environment.promote.useMutation();
	const [nameDraft, setName] = useState<string | null>(null);
	const [scopeDraft, setScope] = useState<EnvironmentScope | null>(null);
	const name = nameDraft ?? preview.data?.name ?? "";
	const scope = scopeDraft ?? preview.data?.scope ?? "organization";

	const onSave = () => {
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

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[440px]">
				<DialogHeader className="px-5 pt-5 pb-3 text-left">
					<DialogTitle className="text-base leading-tight">
						<Trans>Save as environment</Trans>
					</DialogTitle>
					<DialogDescription className="text-xs leading-snug">
						<Trans>
							Snapshots this workspace as it is now, with everything installed
							in it. New workspaces from the environment start from that
							snapshot.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 px-5 pb-5">
					<div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70">
						<EnvironmentPropertyRow
							htmlFor="save-environment-name"
							label={<Trans>Name</Trans>}
						>
							<Input
								className="h-10 w-full px-3 placeholder:text-muted-foreground"
								id="save-environment-name"
								onChange={(event) => setName(event.target.value)}
								placeholder={t({ message: "monorepo" })}
								value={name}
								variant="ghost"
							/>
						</EnvironmentPropertyRow>
						<EnvironmentPropertyRow
							htmlFor="save-environment-repositories"
							label={<Trans>Repositories</Trans>}
						>
							<div
								className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 px-2 py-2"
								id="save-environment-repositories"
							>
								{(preview.data?.repositories ?? []).map((repository) => (
									<span
										className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-muted/60 px-2 text-xs"
										key={repository.id}
									>
										<FaGithub className="size-3 shrink-0 text-muted-foreground" />
										<span className="truncate">{repository.fullName}</span>
									</span>
								))}
							</div>
						</EnvironmentPropertyRow>
						<EnvironmentPropertyRow
							htmlFor="save-environment-scope"
							label={<Trans>Visible to</Trans>}
						>
							<Select
								onValueChange={(value) => setScope(value as EnvironmentScope)}
								value={scope}
							>
								<SelectTrigger
									className={ROW_CONTROL}
									id="save-environment-scope"
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
					</div>
					<p className="text-xs leading-snug text-muted-foreground">
						<Trans>
							The workspace's repositories, as they are checked out now. Boxes
							run in its region.
						</Trans>
					</p>
				</div>
				<DialogFooter className="border-t border-border/70 bg-muted/20 px-5 py-3">
					<Button onClick={() => onOpenChange(false)} size="sm" variant="ghost">
						<Trans>Cancel</Trans>
					</Button>
					<Button
						disabled={!preview.isSuccess || name.trim().length === 0}
						onClick={onSave}
						size="sm"
					>
						<Trans>Save environment</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
