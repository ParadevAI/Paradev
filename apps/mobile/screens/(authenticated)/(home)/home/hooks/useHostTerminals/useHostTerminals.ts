import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { useTerminalSeenStore } from "@/screens/(authenticated)/stores/terminalSeenStore";

export interface TerminalsHost {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
	/**
	 * Poll cadence override. Session marks on a list can be lazier than the
	 * tab strip of an open workspace — and the query key is shared, so when a
	 * workspace screen also observes this host, its faster interval wins for
	 * as long as it is open.
	 */
	refetchIntervalMs?: number;
}

export type TerminalAttention = "working" | "permission" | "failed" | "review";

/** A chat whose agent stopped without being closed; opening it resumes the agent session. */
export interface StoppedChat {
	harness: string;
	harnessSessionId: string;
}

export interface TerminalRowData {
	/** A chat has no PTY: `terminalId` is its chat session id. */
	kind: "terminal" | "chat";
	terminalId: string;
	workspaceId: string;
	/** What to show: the name the user gave the session, else the shell's. */
	title: string;
	/** The user's name on its own, for prefilling a rename. */
	customTitle: string | null;
	ts: number;
	/** Session creation time — the stable ordering key for tab strips. */
	createdAt: number;
	/** Host-clock timestamp of the binding's last agent event. */
	lastEventAt: number | null;
	/** Agent bound to the terminal via lifecycle hooks; null = plain shell. */
	agentId: string | null;
	/** Specific agent definition (a custom config id, or the preset id). */
	definitionId: string | null;
	attention: TerminalAttention | null;
	stopped: StoppedChat | null;
}

export const SESSIONS_REFETCH_INTERVAL_MS = 5_000;

export function getHostTerminalsQueryKey(machineId: string | null) {
	return ["host-terminals", "list", machineId] as const;
}

/**
 * Mirror of desktop's deriveTerminalAgentStatus. `permission` is a live
 * blocking state, never seen-gated; `review` is an unseen Stop — it clears
 * when the seen mark catches up to the binding's lastEventAt.
 */
function attentionFromEvent(
	lastEventType: string,
	lastEventAt: number,
	lastSeenAt: number | undefined,
): TerminalAttention | null {
	switch (lastEventType) {
		case "PermissionRequest":
			return "permission";
		case "Start":
			return "working";
		case "Failed":
			return "failed";
		case "Stop":
			return lastEventAt > (lastSeenAt ?? 0) ? "review" : null;
		default:
			return null;
	}
}

export interface UseHostTerminalsResult {
	terminalsByWorkspace: Map<string, TerminalRowData[]>;
	/**
	 * True once the host answered or failed (or is offline). Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
	/** True while the last answer from some host was a failure. */
	isError: boolean;
}

/**
 * Live terminals served by a set of hosts — the host-wide `terminal.list`
 * joined with `terminalAgents.list` by terminalId, merged across hosts.
 * Terminals are the rows (they're the attachable unit and outlive their
 * agent); bindings supply what terminals can't: agent identity and attention.
 * Chats come from `useHostsChats`; `useHostsSessions` merges the two.
 */
export function useHostsTerminals(
	hosts: TerminalsHost[],
): UseHostTerminalsResult {
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
			queryKey: getHostTerminalsQueryKey(host.machineId),
			refetchInterval: host.refetchIntervalMs,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: false,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async () => {
				const client = getHostServiceClientByUrl(host.hostUrl);
				const [listed, bindings] = await Promise.all([
					client.terminal.list.query({}),
					client.terminalAgents.list.query(),
				]);
				return { sessions: listed.sessions, bindings };
			},
		})),
	});

	return useMemo(() => {
		const terminalsByWorkspace = new Map<string, TerminalRowData[]>();

		for (const query of queries) {
			const bindingsByTerminal = new Map(
				(query.data?.bindings ?? []).map((binding) => [
					binding.terminalId,
					binding,
				]),
			);
			for (const session of query.data?.sessions ?? []) {
				if (session.exited) continue;
				const binding = bindingsByTerminal.get(session.terminalId);
				const row: TerminalRowData = {
					kind: "terminal",
					terminalId: session.terminalId,
					workspaceId: session.workspaceId,
					title: session.title ?? (binding ? binding.agentId : "Terminal"),
					customTitle: session.customTitle,
					ts: binding?.lastEventAt ?? session.createdAt,
					createdAt: session.createdAt,
					lastEventAt: binding?.lastEventAt ?? null,
					agentId: binding?.agentId ?? null,
					definitionId: binding?.definitionId ?? binding?.agentId ?? null,
					attention: binding
						? attentionFromEvent(
								binding.lastEventType,
								binding.lastEventAt,
								terminalSeenAt[session.terminalId],
							)
						: null,
					stopped: null,
				};
				const group = terminalsByWorkspace.get(session.workspaceId);
				if (group) group.push(row);
				else terminalsByWorkspace.set(session.workspaceId, [row]);
			}
		}
		return {
			terminalsByWorkspace,
			isReady: queries.every((query) => query.isSuccess || query.isError),
			isError: queries.some((query) => query.isError),
		};
	}, [queries, terminalSeenAt]);
}
