import { useLingui } from "@lingui/react/macro";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { useWorkspaceName } from "../../../../../../../../hooks/useWorkspaceName";
import { MessageChip } from "../MessageChip";

export function WorkspaceMessageChip({
	chip,
	link,
	workspaceId,
}: {
	chip: ComposerChip;
	link: string;
	workspaceId: string;
}) {
	const { t } = useLingui();
	const name = useWorkspaceName(workspaceId);
	return (
		<MessageChip
			chip={{ ...chip, label: name ?? t({ message: "Workspace" }) }}
			link={link}
		/>
	);
}
