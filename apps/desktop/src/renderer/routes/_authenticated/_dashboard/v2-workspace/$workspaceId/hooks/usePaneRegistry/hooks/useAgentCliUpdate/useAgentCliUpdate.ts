import { useLingui } from "@lingui/react/macro";
import {
	BUILTIN_AGENT_LABELS,
	isBuiltinAgentId,
} from "@superset/shared/agent-catalog";
import { COMPANY } from "@superset/shared/constants";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect } from "react";
import {
	agentCliUpdateKey,
	useAgentCliUpdateWatches,
} from "./stores/agentCliUpdateWatches";
import { hasUpdateLanded } from "./utils/hasUpdateLanded";

const STATUS_STALE_MS = 60_000;
const UPDATE_POLL_MS = 3_000;
const UPDATE_WATCH_MS = 5 * 60_000;

export const AGENT_CLI_UPDATE_DOCS_URL = `${COMPANY.DOCS_URL}/chat#update-the-agent-cli`;

/** Opens a terminal pane running `command`; false when none could open. */
export type RunInTerminal = (
	command: string,
	title: string,
) => Promise<boolean>;

export type AgentCliUpdatePhase = "idle" | "updating" | "updated";

/**
 * The chat CLI's version against its newest release, and an update that runs
 * in a terminal the user can watch. After an update starts, the status is
 * polled until the installed version changes. Only the chat session that
 * started the update sees it land: a session started since already runs the
 * new version.
 */
export function useAgentCliUpdate({
	agentLabel,
	workspaceId,
	harness,
	sessionId,
	onRunInTerminal,
}: {
	agentLabel?: string | undefined;
	workspaceId: string;
	harness: string | undefined;
	sessionId: string | null;
	onRunInTerminal: RunInTerminal | undefined;
}) {
	const { t } = useLingui();
	const key = agentCliUpdateKey(workspaceId, harness);
	const watch = useAgentCliUpdateWatches((store) => store.watches[key] ?? null);
	const startWatch = useAgentCliUpdateWatches((store) => store.start);
	const clearWatch = useAgentCliUpdateWatches((store) => store.clear);
	const { data } = workspaceTrpc.agentTooling.agentCliStatus.useQuery(
		{ workspaceId, harness: harness ?? "" },
		{
			enabled: harness !== undefined,
			staleTime: STATUS_STALE_MS,
			retry: false,
			refetchInterval: (query) =>
				watch && !hasUpdateLanded(watch, query.state.data ?? null)
					? UPDATE_POLL_MS
					: false,
		},
	);
	const status = data ?? null;
	const updated = watch !== null && hasUpdateLanded(watch, status);
	const phase: AgentCliUpdatePhase = !watch
		? "idle"
		: !updated
			? "updating"
			: watch.sessionId === sessionId
				? "updated"
				: "idle";

	useEffect(() => {
		if (!watch || updated) return;
		const timer = setTimeout(
			() => clearWatch(key),
			Math.max(watch.until - Date.now(), 0),
		);
		return () => clearTimeout(timer);
	}, [watch, updated, clearWatch, key]);
	const finish = useCallback(() => clearWatch(key), [clearWatch, key]);

	const command = status?.updateCommand ?? null;
	const canUpdate = command !== null && onRunInTerminal !== undefined;
	const binary = status?.binary;
	const label =
		agentLabel ??
		(binary && isBuiltinAgentId(binary)
			? BUILTIN_AGENT_LABELS[binary]
			: binary);
	const installed = status?.installed ?? null;
	const source = status?.source;
	const update = useCallback(async () => {
		if (!command || !onRunInTerminal || !label || !source) return;
		startWatch(key, {
			from: installed,
			source,
			sessionId,
			until: Date.now() + UPDATE_WATCH_MS,
		});
		const opened = await onRunInTerminal(
			command,
			t({ message: `Update ${label}` }),
		);
		if (!opened) clearWatch(key);
	}, [
		command,
		onRunInTerminal,
		label,
		installed,
		source,
		sessionId,
		t,
		startWatch,
		clearWatch,
		key,
	]);

	return { status, label, phase, canUpdate, update, finish };
}

/**
 * True when the chat's CLI is older than chat needs. Checked again when the
 * chat stops, since the CLI may have changed since the last look.
 */
export function useAgentCliTooOld(
	workspaceId: string,
	harness: string | undefined,
	stopped: boolean,
): boolean {
	const { data, refetch } = workspaceTrpc.agentTooling.agentCliStatus.useQuery(
		{ workspaceId, harness: harness ?? "" },
		{
			enabled: harness !== undefined,
			staleTime: STATUS_STALE_MS,
			retry: false,
		},
	);
	useEffect(() => {
		if (stopped && harness !== undefined) void refetch();
	}, [stopped, harness, refetch]);
	return data?.belowFloor === true;
}

/** True while an update this chat session started has not landed yet. */
export function useAgentCliUpdatePending(
	workspaceId: string,
	harness: string | undefined,
	sessionId: string | null,
): boolean {
	return useAgentCliUpdateWatches(
		(store) =>
			sessionId !== null &&
			store.watches[agentCliUpdateKey(workspaceId, harness)]?.sessionId ===
				sessionId,
	);
}
