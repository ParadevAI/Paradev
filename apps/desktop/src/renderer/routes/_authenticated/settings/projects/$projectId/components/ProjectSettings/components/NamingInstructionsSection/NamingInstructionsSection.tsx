import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { NamingInstructionsField } from "../../../../../../components/NamingInstructionsField";

interface NamingInstructionsSectionProps {
	projectId: string;
	hostUrl: string;
	/** Current instructions; `null` means default AI naming behavior. */
	instructions: string | null;
	/** The person's account-wide instructions. */
	globalInstructions: string | null;
	/** `undefined` on hosts that predate global instructions. */
	ignoreGlobalInstructions: boolean | undefined;
	onChanged: () => void;
}

export function NamingInstructionsSection({
	projectId,
	hostUrl,
	instructions,
	globalInstructions,
	ignoreGlobalInstructions,
	onChanged,
}: NamingInstructionsSectionProps) {
	const { t } = useLingui();
	const hostSupportsGlobal = ignoreGlobalInstructions !== undefined;
	const [ignoreGlobal, setIgnoreGlobal] = useState(
		ignoreGlobalInstructions ?? false,
	);
	const inherited =
		hostSupportsGlobal && !ignoreGlobal ? globalInstructions?.trim() : "";

	const ignoreMutation = useMutation({
		mutationFn: (ignore: boolean) =>
			getHostServiceClientByUrl(
				hostUrl,
			).project.setIgnoreGlobalNamingInstructions.mutate({
				projectId,
				ignore,
			}),
		onSuccess: () => onChanged(),
		onError: (err, ignore) => {
			setIgnoreGlobal(!ignore);
			toast.error(
				errorMessage(
					err,
					t({ message: "Couldn't update the global naming setting" }),
				),
			);
		},
	});

	return (
		<div className="pt-4">
			<div className="mb-3">
				<Label
					htmlFor="project-naming-instructions"
					className="text-sm font-medium"
				>
					<Trans>Naming instructions</Trans>
				</Label>
				<p className="mt-0.5 text-xs text-muted-foreground">
					{inherited ? (
						<Trans>
							Guides AI-generated workspace and branch names for this project.
							These are added after your global instructions and win where the
							two conflict. Empty uses the global instructions.
						</Trans>
					) : (
						<Trans>
							Guides AI-generated workspace and branch names for this project.
							Empty uses the default naming.
						</Trans>
					)}
				</p>
			</div>
			<NamingInstructionsField
				id="project-naming-instructions"
				savedValue={instructions}
				placeholder={
					inherited ||
					t({
						message:
							"Include the Linear ticket id from the prompt in the branch name (e.g. bin-344-fix-login). Prefix branches with fix/ or feat/ based on the task.",
					})
				}
				save={(next) =>
					getHostServiceClientByUrl(
						hostUrl,
					).project.setNamingInstructions.mutate({
						projectId,
						instructions: next,
					})
				}
				onSaved={onChanged}
			/>
			{hostSupportsGlobal && (
				<div className="flex items-center justify-between gap-8 pt-1">
					<Label
						htmlFor="project-ignore-global-naming-instructions"
						className="text-sm font-normal"
					>
						<Trans>Ignore global naming instructions</Trans>
					</Label>
					<Switch
						id="project-ignore-global-naming-instructions"
						checked={ignoreGlobal}
						disabled={ignoreMutation.isPending}
						onCheckedChange={(next) => {
							setIgnoreGlobal(next);
							ignoreMutation.mutate(next);
						}}
					/>
				</div>
			)}
		</div>
	);
}
