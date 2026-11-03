import { useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { CloudUpload } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useState } from "react";
import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MoveChatToCloudDialog } from "./components/MoveChatToCloudDialog";

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
	const [openCount, setOpenCount] = useState(0);
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { workspace } = useWorkspace();
	const { machineId } = useLocalHostService();

	if (
		!cloudEnabled ||
		data.agent?.id !== "claude" ||
		!data.sessionId ||
		workspace.hostId !== machineId
	) {
		return null;
	}

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
					setOpenCount((count) => count + 1);
				}}
			>
				<CloudUpload className="size-3.5" />
			</Button>
			{openCount > 0 && (
				<MoveChatToCloudDialog
					key={openCount}
					open={open}
					onOpenChange={setOpen}
					workspaceId={workspaceId}
					projectId={workspace.projectId}
					chatSessionId={data.sessionId}
					name={data.chatTitle ?? workspace.name}
				/>
			)}
		</>
	);
}
