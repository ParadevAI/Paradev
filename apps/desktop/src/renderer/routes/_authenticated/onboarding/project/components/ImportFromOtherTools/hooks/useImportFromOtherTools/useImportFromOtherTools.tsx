import { useQueryClient } from "@tanstack/react-query";
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
	const queryClient = useQueryClient();
	const { offer, visible, machineId } = useExternalWorktrees({ enabled });
	const [open, setOpen] = useState(false);
	const [dialogKey, setDialogKey] = useState(0);
	const shown = visible && !!machineId;
	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) {
			void queryClient.invalidateQueries({ queryKey: ["external-worktrees"] });
		}
	};
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
					onOpenChange={handleOpenChange}
					onImported={onImported}
				/>
			) : null,
	};
}
