import { presetForAnyHarness } from "@superset/chat/core";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { getChatTransport } from "@/lib/chat";
import { hostServiceUrl } from "@/lib/host-service/client";
import {
	SESSIONS_REFETCH_INTERVAL_MS,
	type TerminalAttention,
	type TerminalRowData,
	type TerminalsHost,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { useTerminalSeenStore } from "@/screens/(authenticated)/stores/terminalSeenStore";
import { isMissingEndpoint } from "./utils/isMissingEndpoint";
import { type HostChat, listWorkspaceChats } from "./utils/listWorkspaceChats";

export function getHostChatsQueryKey(machineId: string | null) {
	return ["host-chats", "list", machineId] as const;
}

/**
 * Mirror of desktop's deriveTerminalAgentStatus. A stopped chat's status is
 * whatever it was when its agent went away, so it has none.
 */
function chatAttention(
	chat: HostChat,
	lastSeenAt: number | undefined,
): TerminalAttention | null {
	if (!chat.live) return null;
	switch (chat.status) {
		case "awaiting_input":
			return "permission";
		case "starting":
		case "running":
			return "working";
		case "dead":
			return "failed";
		case "idle":
			return chat.updatedAt > (lastSeenAt ?? 0) ? "review" : null;
		default:
			return null;
	}
}

// The host keeps no creation time for a chat; first sight keeps tabs still.
const chatFirstSeenAt = new Map<string, number>();

export interface UseHostChatsResult {
	chatsByWorkspace: Map<string, TerminalRowData[]>;
	/** True once every host answered or failed (or is offline). Gates empty states only. */
	isReady: boolean;
	/** True while the last answer from some host was a failure. */
	isError: boolean;
}

/** The chats a set of hosts still has open, running or stopped — see `listWorkspaceChats`. */
export function useHostsChats(hosts: TerminalsHost[]): UseHostChatsResult {
	const terminalSeenAt = useTerminalSeenStore((state) => state.terminalSeenAt);

	const online = useMemo(
		() =>
			hosts
				.filter((host) => host.isOnline)
				.map((host) => ({
					machineId: host.machineId,
					hostUrl: hostServiceUrl(host.organizationId, host.machineId),
					refetchIntervalMs:
						host.refetchIntervalMs ?? SESSIONS_REFETCH_INTERVAL_MS,
				})),
		[hosts],
	);

	const queries = useQueries({
		queries: online.map((host) => ({
			queryKey: getHostChatsQueryKey(host.machineId),
			refetchInterval: host.refetchIntervalMs,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: false,
			retry: 1,
			networkMode: "always" as const,
			queryFn: () =>
				listWorkspaceChats(getChatTransport(host.hostUrl)).catch(
					(error: unknown): HostChat[] => {
						if (isMissingEndpoint(error)) return [];
						throw error;
					},
				),
		})),
	});

	return useMemo(() => {
		const chatsByWorkspace = new Map<string, TerminalRowData[]>();
		for (const query of queries) {
			for (const chat of query.data ?? []) {
				const agentId = presetForAnyHarness(chat.harness) ?? null;
				let firstSeenAt = chatFirstSeenAt.get(chat.sessionId);
				if (firstSeenAt === undefined) {
					firstSeenAt = Date.now();
					chatFirstSeenAt.set(chat.sessionId, firstSeenAt);
				}
				const row: TerminalRowData = {
					kind: "chat",
					terminalId: chat.sessionId,
					workspaceId: chat.workspaceId,
					title: chat.title ?? agentId ?? chat.harness,
					customTitle: null,
					ts: chat.updatedAt,
					createdAt: firstSeenAt,
					lastEventAt: chat.updatedAt,
					agentId,
					definitionId: agentId,
					attention: chatAttention(chat, terminalSeenAt[chat.sessionId]),
					stopped:
						!chat.live && chat.harnessSessionId
							? {
									harness: chat.harness,
									harnessSessionId: chat.harnessSessionId,
								}
							: null,
				};
				const group = chatsByWorkspace.get(chat.workspaceId);
				if (group) group.push(row);
				else chatsByWorkspace.set(chat.workspaceId, [row]);
			}
		}
		return {
			chatsByWorkspace,
			isReady: queries.every((query) => query.isSuccess || query.isError),
			isError: queries.some((query) => query.isError),
		};
	}, [queries, terminalSeenAt]);
}
