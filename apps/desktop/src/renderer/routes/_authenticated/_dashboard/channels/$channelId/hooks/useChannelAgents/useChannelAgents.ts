import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WHERE_FILTER_ANYWHERE } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	type ChannelAgent,
	type ChannelAgentCounts,
	countChannelAgents,
	selectChannelAgents,
} from "./channelAgents";

const AGENT_QUERY_PREFIXES = [
	["v2-workspaces", "terminal-agents"],
	["v2-workspaces", "pull-requests"],
] as const;

/**
 * The board's agent status only polls, and polling pauses while the window
 * is in the background; the host's agent events make the pane move at once.
 */
function useLiveAgentStatus() {
	const queryClient = useQueryClient();
	const { activeHostUrl } = useLocalHostService();
	useEffect(() => {
		if (!activeHostUrl) return;
		const bus = getHostEventBus(activeHostUrl);
		const refresh = () => {
			for (const queryKey of AGENT_QUERY_PREFIXES) {
				void queryClient.invalidateQueries({ queryKey });
			}
		};
		const release = bus.retain();
		const offLifecycle = bus.on("agent:lifecycle", "*", refresh);
		const offBindings = bus.on("agent:bindings-changed", "*", refresh);
		refresh();
		return () => {
			offLifecycle();
			offBindings();
			release();
		};
	}, [activeHostUrl, queryClient]);
}

/** Every workspace the reader can see, with the tags the host serves for it. */
export function useTaggedWorkspaces() {
	const { all, isReady } = useAccessibleV2Workspaces({
		whereFilter: WHERE_FILTER_ANYWHERE,
	});
	useLiveAgentStatus();
	const { workspaces } = useHostWorkspaces();
	const tagsById = useMemo(
		() =>
			new Map(
				workspaces.flatMap((workspace): [string, string[]][] =>
					workspace.tags?.length ? [[workspace.id, workspace.tags]] : [],
				),
			),
		[workspaces],
	);
	return { all, tagsById, isReady };
}

/** The agents of a channel: the workspaces tagged with the channel's name. */
export function useChannelAgents(channelName: string): {
	agents: ChannelAgent[];
	isReady: boolean;
} {
	const { all, tagsById, isReady } = useTaggedWorkspaces();
	const agents = useMemo(
		() => selectChannelAgents(all, tagsById, channelName),
		[all, tagsById, channelName],
	);
	return { agents, isReady };
}

/** For the sidebar: what waits on the reader and what runs, per tag. */
export function useChannelAgentCounts(): Map<string, ChannelAgentCounts> {
	const { all, tagsById } = useTaggedWorkspaces();
	return useMemo(() => countChannelAgents(all, tagsById), [all, tagsById]);
}
