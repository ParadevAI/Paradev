import type { QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	getHostTerminalsQueryKey,
	type TerminalAttention,
	type TerminalRowData,
	type TerminalsHost,
	useHostsTerminals,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { getHostChatsQueryKey, useHostsChats } from "../useHostChats";
import { mergeSessionRows } from "./utils/mergeSessionRows";

export interface UseHostSessionsResult {
	terminalsByWorkspace: Map<string, TerminalRowData[]>;
	attentionByWorkspace: Map<string, TerminalAttention>;
	/** True once both lists answered or failed. Gates empty states only. */
	isReady: boolean;
	/** True while either list's last answer from some host was a failure. */
	isError: boolean;
}

/** Terminals and chats a set of hosts serves, as one list of sessions per workspace. */
export function useHostsSessions(
	hosts: TerminalsHost[],
): UseHostSessionsResult {
	const terminals = useHostsTerminals(hosts);
	const chats = useHostsChats(hosts);
	return useMemo(() => {
		const { rowsByWorkspace, attentionByWorkspace } = mergeSessionRows(
			terminals.terminalsByWorkspace,
			chats.chatsByWorkspace,
		);
		return {
			terminalsByWorkspace: rowsByWorkspace,
			attentionByWorkspace,
			isReady: terminals.isReady && chats.isReady,
			isError: terminals.isError || chats.isError,
		};
	}, [terminals, chats]);
}

/** One host's sessions — see `useHostsSessions`. */
export function useHostSessions(
	host: TerminalsHost | null,
): UseHostSessionsResult {
	const hosts = useMemo(() => (host ? [host] : []), [host]);
	return useHostsSessions(hosts);
}

export function invalidateHostSessions(
	queryClient: QueryClient,
	machineId: string,
): Promise<void> {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: getHostTerminalsQueryKey(machineId),
		}),
		queryClient.invalidateQueries({
			queryKey: getHostChatsQueryKey(machineId),
		}),
	]).then(() => undefined);
}
