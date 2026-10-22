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
import { CloudUpload } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useState } from "react";
import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useMoveChatToCloud } from "../../hooks/useMoveChatToCloud";

interface MoveToCloudButtonProps {
	data: ChatPaneData;
	workspaceId: string;
}

export function MoveToCloudButton({
	data,
	workspaceId,
}: MoveToCloudButtonProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [isMoving, setIsMoving] = useState(false);
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { workspace } = useWorkspace();
	const { machineId } = useLocalHostService();
	const moveChatToCloud = useMoveChatToCloud(workspaceId);
	const harnessSessionId = data.agent?.sessionId;

	if (
		!cloudEnabled ||
		data.agent?.id !== "claude" ||
		!harnessSessionId ||
		workspace.hostId !== machineId
	) {
		return null;
	}

	const move = async () => {
		setIsMoving(true);
		try {
			await moveChatToCloud({
				harnessSessionId,
				name: data.chatTitle ?? workspace.name,
			});
			setOpen(false);
		} catch (error) {
			toast.error(t({ message: "Couldn't move this chat to the cloud" }), {
				description: isMissingProcedureError(error)
					? t({
							message: "Update the host service on this device and try again.",
						})
					: errorMessage(error, t({ message: "Unknown error" })),
			});
		} finally {
			setIsMoving(false);
		}
	};

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="size-6"
				aria-label={t({ message: "Move to cloud" })}
				title={t({ message: "Move to cloud" })}
				onClick={(event) => {
					event.stopPropagation();
					setOpen(true);
				}}
			>
				<CloudUpload className="size-3.5" />
			</Button>
			<AlertDialog
				open={open}
				onOpenChange={(nextOpen) => {
					if (!isMoving) setOpen(nextOpen);
				}}
			>
				<AlertDialogContent onClick={(event) => event.stopPropagation()}>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Move this chat to the cloud?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								Your current work, including uncommitted changes, is pushed to a
								new branch on the remote. A cloud workspace starts from that
								branch and continues this conversation. This chat stays here
								unchanged.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button
							variant="outline"
							disabled={isMoving}
							onClick={() => setOpen(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button disabled={isMoving} onClick={() => void move()}>
							{isMoving ? (
								<Trans>Moving...</Trans>
							) : (
								<Trans>Move to cloud</Trans>
							)}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
