import { useLingui } from "@lingui/react/macro";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
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
	const { workspaces } = useHostWorkspaces();
	const name = workspaces.find(({ id }) => id === workspaceId)?.name;
	return (
		<MessageChip
			chip={{ ...chip, label: name ?? t({ message: "Workspace" }) }}
			link={link}
		/>
	);
}
