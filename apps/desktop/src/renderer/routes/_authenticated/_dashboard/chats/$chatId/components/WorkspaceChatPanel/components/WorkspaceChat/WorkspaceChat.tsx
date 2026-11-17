import { Trans } from "@lingui/react/macro";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { LuLoaderCircle } from "react-icons/lu";
import { SessionView } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/SessionView";
import {
	useChatWiring,
	useSessionClient,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/hooks/useSessionClient";

const NO_PROMPTS: never[] = [];
const noop = () => {};
const REFRESH_MS = 10_000;

/**
 * The workspace's latest chat with its agent, live, with its own composer.
 * Rendered inside the workspace's providers.
 */
export function WorkspaceChat({ workspaceId }: { workspaceId: string }) {
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const sessions = useQuery({
		queryKey: ["chat-v3", hostUrl, "preview-sessions", workspaceId],
		queryFn: () => transport.listSessions({ workspaceId, limit: 20 }),
		refetchInterval: (query) => (query.state.data?.length ? false : REFRESH_MS),
		refetchOnWindowFocus: false,
	});
	const latest =
		sessions.data?.find((session) => session.live) ?? sessions.data?.[0];
	const { client } = useSessionClient(latest?.sessionId ?? null);

	if (client && latest) {
		return (
			<SessionView
				key={latest.sessionId}
				client={client}
				chatKey={latest.sessionId}
				draftKey={`preview:${latest.sessionId}`}
				workspaceId={workspaceId}
				isActive
				pendingPrompts={NO_PROMPTS}
				onPendingPromptsSent={noop}
			/>
		);
	}
	return (
		<div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
			{sessions.isPending ? (
				<LuLoaderCircle className="size-5 animate-spin" />
			) : sessions.isError ? (
				<Trans>Couldn't reach this workspace's chat.</Trans>
			) : (
				<Trans>
					This workspace has no chat yet. Open the workspace to see its
					terminals.
				</Trans>
			)}
		</div>
	);
}
