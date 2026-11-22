import { AlertDialog } from "@superset/ui/alert-dialog";
import { useResizeMachineConfirmStore } from "renderer/stores/resize-machine-confirm";
import { ResizeMachineConfirmContent } from "./components/ResizeMachineConfirmContent";

export function ResizeMachineConfirmDialog() {
	const pending = useResizeMachineConfirmStore((state) => state.pending);
	const close = useResizeMachineConfirmStore((state) => state.close);
	return (
		<AlertDialog
			open={pending !== null}
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			{pending ? (
				<ResizeMachineConfirmContent
					workspaceId={pending.workspaceId}
					size={pending.size}
					onDone={close}
				/>
			) : null}
		</AlertDialog>
	);
}
