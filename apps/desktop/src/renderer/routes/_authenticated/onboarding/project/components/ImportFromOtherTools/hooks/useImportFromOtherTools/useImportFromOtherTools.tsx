import { useState } from "react";
import { ImportFromOtherToolsDialog } from "../../components/ImportFromOtherToolsDialog";
import { useExternalWorktrees } from "../useExternalWorktrees";

export function useImportFromOtherTools({
	enabled,
	onImported,
}: {
	enabled: boolean;
	onImported: (projectId: string) => Promise<void>;
}) {
	const { offer, visible, machineId } = useExternalWorktrees();
	const [open, setOpen] = useState(false);
	const [dialogKey, setDialogKey] = useState(0);
	const shown = enabled && visible && !!machineId;
	return {
		shown,
		offer,
		openDialog: () => {
			setDialogKey((key) => key + 1);
			setOpen(true);
		},
		dialog:
			shown && machineId ? (
				<ImportFromOtherToolsDialog
					key={dialogKey}
					open={open}
					offer={offer}
					hostId={machineId}
					onOpenChange={setOpen}
					onImported={onImported}
				/>
			) : null,
	};
}
