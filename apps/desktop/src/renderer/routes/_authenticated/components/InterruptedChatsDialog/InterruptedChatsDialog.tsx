import { WorkspaceClientProvider } from "@superset/workspace-client";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { InterruptedChatsPrompt } from "./components/InterruptedChatsPrompt";

export function InterruptedChatsDialog() {
	const { activeHostUrl } = useLocalHostService();
	if (!activeHostUrl) return null;
	return (
		<WorkspaceClientProvider
			cacheKey="interrupted-chats"
			key={activeHostUrl}
			hostUrl={activeHostUrl}
			headers={() => getHostServiceHeaders(activeHostUrl)}
			wsToken={() => getHostServiceWsToken(activeHostUrl)}
		>
			<InterruptedChatsPrompt />
		</WorkspaceClientProvider>
	);
}
