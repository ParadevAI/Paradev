import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChannelAgent } from "../../hooks/useChannelAgents";
import {
	type ChannelActivity,
	EMPTY_ACTIVITY,
	recordAgents,
} from "./channelActivity";

export const CHANNEL_ACTIVITY_STORAGE_KEY = "channel-activity-v1";
const MAX_CHANNELS = 20;

interface ChannelActivityState {
	byChannelId: Record<string, ChannelActivity>;
	/** Turns what the agents look like now into events, once per change. */
	record: (channelId: string, agents: readonly ChannelAgent[]) => void;
	markSeen: (channelId: string) => void;
}

/** Keeps the most recently active channels; older ones lose their timeline. */
function bounded(
	byChannelId: Record<string, ChannelActivity>,
): Record<string, ChannelActivity> {
	const entries = Object.entries(byChannelId);
	if (entries.length <= MAX_CHANNELS) return byChannelId;
	return Object.fromEntries(
		entries
			.sort((a, b) => b[1].touchedAt - a[1].touchedAt)
			.slice(0, MAX_CHANNELS),
	);
}

/**
 * What the agents of each channel did, as this renderer saw it: the channel's
 * log cannot carry agent events yet, so their state changes are kept here,
 * bounded per channel and by channel.
 */
export const useChannelActivityStore = create<ChannelActivityState>()(
	persist(
		(set) => ({
			byChannelId: {},
			record: (channelId, agents) =>
				set((state) => {
					const current = state.byChannelId[channelId] ?? EMPTY_ACTIVITY;
					const next = recordAgents(current, agents, Date.now());
					if (next === current) return state;
					return {
						byChannelId: bounded({
							...state.byChannelId,
							[channelId]: next,
						}),
					};
				}),
			markSeen: (channelId) =>
				set((state) => {
					const current = state.byChannelId[channelId] ?? EMPTY_ACTIVITY;
					const now = Date.now();
					return {
						byChannelId: bounded({
							...state.byChannelId,
							[channelId]: { ...current, seenAt: now, touchedAt: now },
						}),
					};
				}),
		}),
		{
			name: CHANNEL_ACTIVITY_STORAGE_KEY,
			partialize: (state) => ({ byChannelId: state.byChannelId }),
		},
	),
);
