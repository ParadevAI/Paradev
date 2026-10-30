import { Trans } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { AddSecretSheet } from "renderer/routes/_authenticated/components/AddSecretSheet";
import { EditSecretDialog } from "./components/EditSecretDialog";
import { EnvironmentVariablesList } from "./components/EnvironmentVariablesList";

interface EnvironmentSecretsProps {
	environmentId: string;
}

interface EditingSecret {
	id: string;
	key: string;
	value: string;
	sensitive: boolean;
}

export function EnvironmentSecrets({ environmentId }: EnvironmentSecretsProps) {
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [editing, setEditing] = useState<EditingSecret | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	const reload = useCallback(() => setReloadKey((key) => key + 1), []);

	return (
		<div className="w-full p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Environment variables</Trans>
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					<Trans>
						Set on every workspace started from this environment, and while it
						builds.
					</Trans>
				</p>
			</div>

			<EnvironmentVariablesList
				environmentId={environmentId}
				onAdd={() => setIsAddOpen(true)}
				refreshToken={reloadKey}
				onEdit={(secret) =>
					setEditing({
						id: secret.id,
						key: secret.key,
						value: secret.value,
						sensitive: secret.sensitive,
					})
				}
			/>

			<AddSecretSheet
				environmentId={environmentId}
				onOpenChange={setIsAddOpen}
				onSaved={reload}
				open={isAddOpen}
			/>

			{editing && (
				<EditSecretDialog
					environmentId={environmentId}
					onOpenChange={(open) => {
						if (!open) setEditing(null);
					}}
					onSaved={reload}
					open={Boolean(editing)}
					secret={editing}
				/>
			)}
		</div>
	);
}
