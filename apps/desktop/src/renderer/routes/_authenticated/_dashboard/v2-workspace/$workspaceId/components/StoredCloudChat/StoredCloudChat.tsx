import { FEATURE_FLAGS } from "@superset/shared/constants";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { type ReactNode, useEffect } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import {
	loadStoredChatSnapshot,
	shownStoredChatKey,
	storedChatSnapshotKey,
} from "../../utils/loadStoredChatSnapshot";
import { StoredChatTranscript } from "../StoredChatTranscript";
import { CloudWorkspaceWakingStrip } from "./components/CloudWorkspaceWakingStrip";

/** The tab bar, agent row and pane header above a chat pane's transcript, so these rows sit where the pane's will. */
const PANE_CHROME_PX = 118;
/** A woken box resumes a chat as a new session, so the pane may open any of the latest few. */
const PREFETCHED_CHATS = 5;
const STALE_MS = 60_000;
const NO_PROMPTS: never[] = [];

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
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.WORKSPACE_MOVES) === true;
	const chats = cloudTrpc.chatHistory.ofWorkspace.useQuery(
		{ workspaceId },
		{ enabled },
	);
	const chatId = chats.data?.[0]?.id ?? null;
	const stored = useQuery(
		{
			queryKey: storedChatSnapshotKey(chatId),
			queryFn: () => loadStoredChatSnapshot(chatId as string),
			enabled: enabled && chatId !== null,
			placeholderData: keepPreviousData,
			staleTime: STALE_MS,
			retry: false,
		},
		electronQueryClient,
	);
	const shownChatId = stored.isPlaceholderData ? null : chatId;
	useEffect(() => {
		if (shownChatId) {
			electronQueryClient.setQueryData(
				shownStoredChatKey(workspaceId),
				shownChatId,
			);
		}
	}, [shownChatId, workspaceId]);
	useEffect(() => {
		for (const chat of chats.data?.slice(1, PREFETCHED_CHATS) ?? []) {
			void electronQueryClient.prefetchQuery({
				queryKey: storedChatSnapshotKey(chat.id),
				queryFn: () => loadStoredChatSnapshot(chat.id),
				staleTime: STALE_MS,
			});
		}
	}, [chats.data]);
	if (!enabled || !chatId || !stored.data) return fallback;
	return (
		<div
			className="relative flex h-full w-full flex-col"
			style={{ paddingTop: PANE_CHROME_PX }}
		>
			<CloudWorkspaceWakingStrip workspaceId={workspaceId} />
			<StoredChatTranscript
				chatId={chatId}
				pending={NO_PROMPTS}
				snapshot={stored.data}
			/>
			<div className="h-6" />
		</div>
	);
}
