import { Trans } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { AddSecretSheet } from "./components/AddSecretSheet";
import { EditSecretDialog } from "./components/EditSecretDialog";
import { EnvironmentVariablesList } from "./components/EnvironmentVariablesList";

interface EnvironmentVariablesProps {
	environmentId: string;
}

interface EditingSecret {
	id: string;
	key: string;
	value: string;
	sensitive: boolean;
}

export function EnvironmentVariables({
	environmentId,
}: EnvironmentVariablesProps) {
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [editing, setEditing] = useState<EditingSecret | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	const reload = useCallback(() => setReloadKey((key) => key + 1), []);

	return (
		<section className="space-y-3">
			<h3 className="text-base font-semibold">
				<Trans>Environment variables</Trans>
			</h3>
			<EnvironmentVariablesList
				environmentId={environmentId}
				onAdd={() => setIsAddOpen(true)}
				onEdit={(secret) =>
					setEditing({
						id: secret.id,
						key: secret.key,
						value: secret.value,
						sensitive: secret.sensitive,
					})
				}
				refreshToken={reloadKey}
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
					open
					secret={editing}
				/>
			)}
		</section>
	);
}
