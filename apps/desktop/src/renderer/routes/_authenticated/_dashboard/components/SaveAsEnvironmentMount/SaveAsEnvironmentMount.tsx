import { useSaveAsEnvironmentIntent } from "renderer/stores/save-as-environment-intent";
import { SaveAsEnvironmentDialog } from "./components/SaveAsEnvironmentDialog";

export function SaveAsEnvironmentMount() {
	const workspaceId = useSaveAsEnvironmentIntent((state) => state.workspaceId);
	const close = useSaveAsEnvironmentIntent((state) => state.close);
	if (!workspaceId) return null;
	return (
		<SaveAsEnvironmentDialog
			cloudWorkspaceId={workspaceId}
			key={workspaceId}
			onOpenChange={(open) => {
				if (!open) close();
			}}
			open
		/>
	);
}
