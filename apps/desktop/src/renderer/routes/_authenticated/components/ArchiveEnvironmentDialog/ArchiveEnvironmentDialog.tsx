import { Trans } from "@lingui/react/macro";
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

interface ArchiveEnvironmentDialogProps {
	environmentName: string | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function ArchiveEnvironmentDialog({
	environmentName,
	onOpenChange,
	onConfirm,
}: ArchiveEnvironmentDialogProps) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={environmentName !== null}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Archive {environmentName}?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							This permanently removes the saved environment for everyone with
							access to it. Workspaces already running from it stay available.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						<Trans>Archive environment</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
