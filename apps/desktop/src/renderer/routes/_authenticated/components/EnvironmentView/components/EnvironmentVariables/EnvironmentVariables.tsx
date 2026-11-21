import { Trans } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { AddSecretSheet } from "./components/AddSecretSheet";
import { EditSecretDialog } from "./components/EditSecretDialog";
import { EnvironmentVariablesList } from "./components/EnvironmentVariablesList";

interface EditingSecret {
	id: string;
	key: string;
	value: string;
	sensitive: boolean;
}

interface EnvironmentVariablesProps {
	environmentId: string;
}

export function EnvironmentVariables({
	environmentId,
}: EnvironmentVariablesProps) {
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [editing, setEditing] = useState<EditingSecret | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	const reload = useCallback(() => setReloadKey((key) => key + 1), []);

	return (
		<div>
			<span className="mb-2 block text-xs font-medium">
				<Trans>Variables</Trans>
			</span>
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
					open
					secret={editing}
				/>
			)}
		</div>
	);
}
