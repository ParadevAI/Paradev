import { useLingui } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service/trpc";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	keepPreviousData,
	QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { type ReactNode, useEffect } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { sandboxWakeQueryKey } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { useCountdown } from "../../hooks/useCountdown";
import {
	loadStoredChatSnapshot,
	storedChatSnapshotKey,
} from "../../utils/loadStoredChatSnapshot";
import { ConnectionPill, WAKE_UP_ESTIMATE_SECONDS } from "../ConnectionPill";
import { StoredChatTranscript } from "../StoredChatTranscript";

/** The tab bar, agent row and pane header above a chat pane's transcript, so these rows sit where the pane's will. */
const PANE_CHROME_PX = 118;
/** A woken box resumes a chat as a new session, so the pane may open any of the latest few. */
const PREFETCHED_CHATS = 5;
const STALE_MS = 60_000;
const NO_PROMPTS: never[] = [];

const asleepHostLink: TRPCLink<AppRouter> = () => () =>
	observable((observer) =>
		observer.error(
			TRPCClientError.from(new Error("The workspace is still waking up")),
		),
	);
const asleepHostClient = workspaceTrpc.createClient({
	links: [asleepHostLink],
});
const asleepHostQueryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});

/**
 * A cloud workspace's newest chat as the database holds it, while the
 * workspace waits for its box to answer, else `fallback`. It is cached under
 * the key the chat pane reads, so when the workspace opens, its chat shows the
 * same rows straight away.
 */
export function StoredCloudChat({
	fallback,
	workspaceId,
}: {
	fallback: ReactNode;
	workspaceId: string;
}) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const secondsLeft = useCountdown(WAKE_UP_ESTIMATE_SECONDS);
	const chats = cloudTrpc.chatHistory.ofWorkspace.useQuery({ workspaceId });
	const chatId = chats.data?.[0]?.id ?? null;
	const stored = useQuery(
		{
			queryKey: storedChatSnapshotKey(chatId),
			queryFn: () => loadStoredChatSnapshot(chatId as string),
			enabled: chatId !== null,
			placeholderData: keepPreviousData,
			staleTime: STALE_MS,
			retry: false,
		},
		electronQueryClient,
	);
	useEffect(() => {
		for (const chat of chats.data?.slice(1, PREFETCHED_CHATS) ?? []) {
			void electronQueryClient.prefetchQuery({
				queryKey: storedChatSnapshotKey(chat.id),
				queryFn: () => loadStoredChatSnapshot(chat.id),
				staleTime: STALE_MS,
			});
		}
	}, [chats.data]);
	if (!chatId || !stored.data) return fallback;
	return (
		<div
			className="relative flex h-full w-full flex-col"
			style={{ paddingTop: PANE_CHROME_PX }}
		>
			<ConnectionPill
				className="top-6"
				label={
					secondsLeft > 0
						? t({ message: "Waking up workspace" })
						: t({ message: "Still waking up…" })
				}
				detail={t({
					message:
						"This cloud workspace is waking up, which can take up to 30 seconds after it has been idle.",
				})}
				dialing
				trailing={secondsLeft > 0 ? t({ message: `~${secondsLeft}s` }) : null}
				onRetry={() =>
					void queryClient.invalidateQueries({
						queryKey: sandboxWakeQueryKey(workspaceId),
					})
				}
			/>
			<workspaceTrpc.Provider
				client={asleepHostClient}
				queryClient={asleepHostQueryClient}
			>
				<StoredChatTranscript
					chatId={chatId}
					pending={NO_PROMPTS}
					snapshot={stored.data}
				/>
			</workspaceTrpc.Provider>
			<div className="h-6" />
		</div>
	);
}
