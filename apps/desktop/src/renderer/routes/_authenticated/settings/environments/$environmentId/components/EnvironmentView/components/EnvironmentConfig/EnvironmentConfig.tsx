import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { SettingsSection } from "renderer/routes/_authenticated/settings/components/SettingsSection";
import { CONFIG_PLACEHOLDER } from "./constants";

type Environment = RouterOutputs["environment"]["get"];

interface EnvironmentConfigProps {
	environment: Environment;
}

export function EnvironmentConfig({ environment }: EnvironmentConfigProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const saved = environment.config ?? "";
	const [draft, setDraft] = useState(saved);
	const [justSaved, setJustSaved] = useState(false);

	useEffect(() => setDraft(saved), [saved]);

	const update = cloudTrpc.environment.update.useMutation({
		onSuccess: async () => {
			await utils.environment.invalidate();
			setJustSaved(true);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const changed = draft !== saved;

	return (
		<SettingsSection
			action={
				<Button
					className="h-8"
					disabled={!changed || update.isPending}
					onClick={() => {
						setJustSaved(false);
						update.mutate({
							id: environment.id,
							config: draft.trim() ? draft : null,
						});
					}}
					size="sm"
				>
					<Trans>Save config</Trans>
				</Button>
			}
			description={t({
				message:
					"The config.toml this environment's builds and cloud workspaces run. A repository's own config.toml is not used in the cloud.",
			})}
			title={t({ message: "Config" })}
		>
			<Textarea
				aria-label={t({ message: "Config" })}
				className="min-h-48 font-mono text-xs md:text-xs"
				onChange={(event) => {
					setDraft(event.target.value);
					setJustSaved(false);
				}}
				placeholder={CONFIG_PLACEHOLDER}
				spellCheck={false}
				value={draft}
			/>
			{changed ? null : environment.config === null ? (
				<p className="text-xs text-amber-600 dark:text-amber-500">
					<Trans>
						No config yet: workspaces on this environment run no setup or
						terminals, and builds fail until a config is saved.
					</Trans>
				</p>
			) : justSaved ? (
				<p className="text-xs text-muted-foreground">
					<Trans>
						New workspaces and the next build use this config. Running
						workspaces pick it up when they restart.
					</Trans>
				</p>
			) : null}
		</SettingsSection>
	);
}
