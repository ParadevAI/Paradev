import { ChatUnderConstruction } from "renderer/components/ChatUnderConstruction";
import type { ChatLaunchConfig } from "shared/tabs-types";

// Chat is temporarily disabled while it's being reworked; the pane keeps its
// props so existing chat panes still mount without churn in the registry.
export function ChatPane(_props: {
	onSessionIdChange: (sessionId: string | null) => void;
	sessionId: string | null;
	workspaceId: string;
	initialLaunchConfig?: ChatLaunchConfig | null;
	onConsumeLaunchConfig?: () => void;
}) {
	return <ChatUnderConstruction />;
}
