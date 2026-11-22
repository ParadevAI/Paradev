import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useCallback, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { AddVariablesForm } from "./components/AddVariablesForm";
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
	const [isAdding, setIsAdding] = useState(false);
	const [editing, setEditing] = useState<EditingSecret | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	const reload = useCallback(() => setReloadKey((key) => key + 1), []);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-4">
				<span className="text-xs font-medium">
					<Trans>Variables</Trans>
				</span>
				{!isAdding && (
					<Button onClick={() => setIsAdding(true)} size="xs" variant="outline">
						<LuPlus />
						<Trans>Add variables</Trans>
					</Button>
				)}
			</div>
			{isAdding && (
				<AddVariablesForm
					environmentId={environmentId}
					onClose={() => setIsAdding(false)}
					onSaved={reload}
				/>
			)}
			<EnvironmentVariablesList
				environmentId={environmentId}
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
