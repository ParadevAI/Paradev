import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import {
	type MoveToComputerStage,
	useMoveWorkspaceToComputer,
} from "../../../../hooks/useMoveWorkspaceToComputer";
import type { MovableWorkspace } from "../../../../hooks/useWorkspaceMoveDirection";
import { useReportSkippedChats } from "../../hooks/useReportSkippedChats";

interface MoveWorkspaceToComputerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspace: MovableWorkspace;
}

export function MoveWorkspaceToComputerDialog({
	open,
	onOpenChange,
	workspace,
}: MoveWorkspaceToComputerDialogProps) {
	const { t } = useLingui();
	const [stage, setStage] = useState<MoveToComputerStage | null>(null);
	const moveWorkspaceToComputer = useMoveWorkspaceToComputer(workspace);
	const reportSkipped = useReportSkippedChats();

	const move = async () => {
		setStage("saving");
		try {
			const { skipped } = await moveWorkspaceToComputer({ onStage: setStage });
			onOpenChange(false);
			reportSkipped(skipped);
		} catch (error) {
			toast.error(
				t({ message: "Couldn't move this workspace to this computer" }),
				{
					description: isMissingProcedureError(error)
						? t({
								message:
									"Update the host service on this device and try again.",
							})
						: errorMessage(error, t({ message: "Unknown error" })),
				},
			);
		} finally {
			setStage(null);
		}
	};

	return (
		<AlertDialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!stage) onOpenChange(nextOpen);
			}}
		>
			<AlertDialogContent onClick={(event) => event.stopPropagation()}>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Move this workspace to this computer?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							The cloud workspace's work, including uncommitted changes, is
							pushed to a new branch. A workspace on this computer starts from
							that branch, and each Claude chat continues there. Agents that are
							working stop first. Terminals and other chats stay in the cloud.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				{stage && (
					<p className="text-sm text-muted-foreground" aria-live="polite">
						{stage === "saving" ? (
							<Trans>Saving the cloud workspace's work and its chats…</Trans>
						) : (
							<Trans>Creating a workspace on this computer…</Trans>
						)}
					</p>
				)}
				<AlertDialogFooter>
					<Button
						variant="outline"
						disabled={!!stage}
						onClick={() => onOpenChange(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button disabled={!!stage} onClick={() => void move()}>
						{stage ? (
							<Trans>Moving...</Trans>
						) : (
							<Trans>Move to this computer</Trans>
						)}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
