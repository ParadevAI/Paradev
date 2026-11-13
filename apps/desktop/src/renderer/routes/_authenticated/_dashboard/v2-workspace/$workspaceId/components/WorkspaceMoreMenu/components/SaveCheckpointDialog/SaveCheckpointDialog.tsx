import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { WorkspaceEnvironment } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceEnvironment";

interface SaveCheckpointDialogProps {
	cloudWorkspaceId: string;
	environment: WorkspaceEnvironment;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SaveCheckpointDialog({
	cloudWorkspaceId,
	environment,
	open,
	onOpenChange,
}: SaveCheckpointDialogProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const promote = cloudTrpc.environment.promote.useMutation();
	const name = environment.name;

	const handleSave = () => {
		toast.promise(
			promote
				.mutateAsync({ cloudWorkspaceId, environmentId: environment.id })
				.then(() => utils.environment.invalidate()),
			{
				loading: t({ message: `Saving a checkpoint to ${name}...` }),
				success: t({ message: `Checkpoint saved to ${name}` }),
				error: (error) => errorMessage(error),
			},
		);
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[380px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Trans>Save a checkpoint to {name}?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							Saves this workspace as it is now, with everything installed in
							it. New workspaces from {name} start from this checkpoint. The
							workspace stops for a moment while it saves.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<AlertDialogAction
						disabled={promote.isPending}
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleSave}
					>
						<Trans>Save checkpoint</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
