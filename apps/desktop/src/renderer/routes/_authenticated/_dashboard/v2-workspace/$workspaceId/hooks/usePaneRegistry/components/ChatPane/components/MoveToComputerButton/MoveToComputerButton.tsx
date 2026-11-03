import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { FEATURE_FLAGS } from "@superset/shared/constants";
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
import { Laptop } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useState } from "react";
import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	type MoveToComputerStage,
	useMoveChatToComputer,
} from "../../hooks/useMoveChatToComputer";

interface MoveToComputerButtonProps {
	data: ChatPaneData;
	workspaceId: string;
}

export function MoveToComputerButton({
	data,
	workspaceId,
}: MoveToComputerButtonProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [stage, setStage] = useState<MoveToComputerStage | null>(null);
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { workspace } = useWorkspace();
	const { machineId } = useLocalHostService();
	const { cache } = useHostWorkspaces();
	const moveChatToComputer = useMoveChatToComputer(workspaceId);
	const chatSessionId = data.sessionId;

	if (
		!cloudEnabled ||
		data.agent?.id !== "claude" ||
		!chatSessionId ||
		workspace.hostId === machineId ||
		!cache.isSandboxHost(workspace.hostId)
	) {
		return null;
	}

	const move = async () => {
		setStage("saving");
		try {
			await moveChatToComputer({ chatSessionId, onStage: setStage });
			setOpen(false);
		} catch (error) {
			toast.error(t({ message: "Couldn't move this chat to this computer" }), {
				description: isMissingProcedureError(error)
					? t({
							message: "Update the host service on this device and try again.",
						})
					: errorMessage(error, t({ message: "Unknown error" })),
			});
		} finally {
			setStage(null);
		}
	};

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="size-6"
				aria-label={t({ message: "Move to this computer" })}
				title={t({ message: "Move to this computer" })}
				onClick={(event) => {
					event.stopPropagation();
					setOpen(true);
				}}
			>
				<Laptop className="size-3.5" />
			</Button>
			<AlertDialog
				open={open}
				onOpenChange={(nextOpen) => {
					if (!stage) setOpen(nextOpen);
				}}
			>
				<AlertDialogContent onClick={(event) => event.stopPropagation()}>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Move this chat to this computer?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								The cloud workspace's work, including uncommitted changes, is
								pushed to a new branch. A workspace on this computer starts from
								that branch, and this conversation continues there. If the agent
								is working, it stops first.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					{stage && (
						<p className="text-sm text-muted-foreground" aria-live="polite">
							{stage === "saving" ? (
								<Trans>
									Saving the cloud workspace's work and this conversation…
								</Trans>
							) : (
								<Trans>Creating a workspace on this computer…</Trans>
							)}
						</p>
					)}
					<AlertDialogFooter>
						<Button
							variant="outline"
							disabled={!!stage}
							onClick={() => setOpen(false)}
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
		</>
	);
}
