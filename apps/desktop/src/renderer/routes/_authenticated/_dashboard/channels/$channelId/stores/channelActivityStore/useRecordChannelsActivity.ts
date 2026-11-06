import { useEffect } from "react";
import {
	selectChannelAgents,
	useTaggedWorkspaces,
} from "../../hooks/useChannelAgents";
import { useChannelActivityStore } from "./channelActivityStore";

/**
 * Keeps every channel's timeline current while the sidebar is on screen,
 * so an agent that finished while another channel was open still shows up
 * as an event there.
 */
export function useRecordChannelsActivity(
	channels: ReadonlyArray<{ id: string; name: string }>,
): void {
	const { all, tagsById, isReady } = useTaggedWorkspaces();
	const record = useChannelActivityStore((state) => state.record);
	useEffect(() => {
		if (!isReady) return;
		for (const channel of channels) {
			record(channel.id, selectChannelAgents(all, tagsById, channel.name));
		}
	}, [all, tagsById, isReady, channels, record]);
}
