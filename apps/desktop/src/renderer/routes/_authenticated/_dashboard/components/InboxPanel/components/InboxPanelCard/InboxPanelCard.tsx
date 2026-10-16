import type { ComponentProps } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { InboxCard } from "../InboxCard";

type InboxPanelCardProps = Omit<ComponentProps<typeof InboxCard>, "agentId">;

/** A card in the panel: the host's live agent binding, then the card itself. */
export function InboxPanelCard(props: InboxPanelCardProps) {
	const binding = useTerminalAgentBinding(
		props.card.workspaceId ?? "",
		props.card.agentSessionId,
	);
	return <InboxCard {...props} agentId={binding?.agentId} />;
}
