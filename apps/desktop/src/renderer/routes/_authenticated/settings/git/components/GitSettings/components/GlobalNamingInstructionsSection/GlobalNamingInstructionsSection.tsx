import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { NamingInstructionsField } from "../../../../../components/NamingInstructionsField";

export function GlobalNamingInstructionsSection() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const { data: settings } = cloudTrpc.userSettings.get.useQuery();
	const update = cloudTrpc.userSettings.update.useMutation({
		onSuccess: (next) => utils.userSettings.get.setData(undefined, next),
	});

	return (
		<section className="mt-8">
			<div className="mb-3">
				<Label
					htmlFor="global-naming-instructions"
					className="text-sm font-medium"
				>
					<Trans>Naming instructions</Trans>
				</Label>
				<p className="mt-0.5 text-xs text-muted-foreground">
					<Trans>
						Guides AI-generated workspace and branch names in every project, on
						all your devices. A project's own instructions are added after these
						and win where the two conflict.
					</Trans>
				</p>
			</div>
			{settings && (
				<NamingInstructionsField
					id="global-naming-instructions"
					savedValue={settings.namingInstructions ?? null}
					placeholder={t({
						message:
							"Include the Linear ticket id from the prompt in the branch name (e.g. bin-344-fix-login). Prefix branches with fix/ or feat/ based on the task.",
					})}
					save={(namingInstructions) =>
						update.mutateAsync({ namingInstructions })
					}
				/>
			)}
		</section>
	);
}
