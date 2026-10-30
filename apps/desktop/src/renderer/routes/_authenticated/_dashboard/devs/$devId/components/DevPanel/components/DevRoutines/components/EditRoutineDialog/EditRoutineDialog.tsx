import { Dialog, DialogContent } from "@superset/ui/dialog";
import type { Routine } from "../../types";
import { EditRoutineForm } from "./components/EditRoutineForm";

interface EditRoutineDialogProps {
	devId: string;
	routine: Routine | null;
	onClose: () => void;
}

export function EditRoutineDialog({
	devId,
	routine,
	onClose,
}: EditRoutineDialogProps) {
	return (
		<Dialog open={routine !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[540px]">
				{routine && (
					<EditRoutineForm
						key={routine.id}
						devId={devId}
						routine={routine}
						onDone={onClose}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
