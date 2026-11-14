import { Plural, Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";

interface StopWithSubagentsDialogProps {
	subagentCount: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function StopWithSubagentsDialog({
	subagentCount,
	open,
	onOpenChange,
	onConfirm,
}: StopWithSubagentsDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[380px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Trans>Stop this response?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Plural
							value={subagentCount}
							one="The agent cannot stop only this response. Stopping also stops the background subagent that is still running."
							other="The agent cannot stop only this response. Stopping also stops the # background subagents that are still running."
						/>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
					<AlertDialogCancel className="h-7 border-0 bg-transparent px-3 text-xs shadow-none">
						<Trans>Keep running</Trans>
					</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
					>
						<Trans>Stop all</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
