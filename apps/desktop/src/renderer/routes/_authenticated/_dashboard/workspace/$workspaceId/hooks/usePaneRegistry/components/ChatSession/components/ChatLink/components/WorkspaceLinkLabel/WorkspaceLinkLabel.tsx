import { Trans } from "@lingui/react/macro";
import { useWorkspaceName } from "../../../../hooks/useWorkspaceName";

export function WorkspaceLinkLabel({ workspaceId }: { workspaceId: string }) {
	return useWorkspaceName(workspaceId) ?? <Trans>Workspace</Trans>;
}
