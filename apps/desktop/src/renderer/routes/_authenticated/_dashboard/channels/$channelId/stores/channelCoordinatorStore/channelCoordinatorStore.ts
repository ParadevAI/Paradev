import type { UserContent } from "@superset/chat/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const CHANNEL_COORDINATORS_STORAGE_KEY = "channel-coordinators-v1";
const MAX_CHANNELS = 20;

/**
 * The chat session that coordinates a channel: one of the reader's own, in one
 * of their workspaces. `sessionId` is null until the host has minted it; the
 * prompts queued meanwhile go out as soon as it is ready.
 */
export interface ChannelCoordinator {
	workspaceId: string;
	terminalId: string;
	agentId: string;
	sessionId: string | null;
	pendingPrompts: UserContent[][];
	linkedAt: number;
}

/** How the channel's coordinator is set up; kept across Start over. */
export interface CoordinatorSettings {
	agentId: string;
	instructions: string;
	updatedAt: number;
}

export const DEFAULT_COORDINATOR_AGENT = "claude";

interface ChannelCoordinatorState {
	byChannelId: Record<string, ChannelCoordinator>;
	settingsByChannelId: Record<string, CoordinatorSettings>;
	link: (
		channelId: string,
		coordinator: Omit<ChannelCoordinator, "linkedAt">,
	) => void;
	setSessionId: (channelId: string, sessionId: string) => void;
	setPendingPrompts: (channelId: string, prompts: UserContent[][]) => void;
	unlink: (channelId: string) => void;
	setSettings: (
		channelId: string,
		patch: Partial<Omit<CoordinatorSettings, "updatedAt">>,
	) => void;
}

/** Keeps the most recently touched channels; older entries fall away. */
function bounded<T>(
	entries: Record<string, T>,
	touchedAt: (entry: T) => number,
): Record<string, T> {
	const list = Object.entries(entries);
	if (list.length <= MAX_CHANNELS) return entries;
	return Object.fromEntries(
		list
			.sort((a, b) => touchedAt(b[1]) - touchedAt(a[1]))
			.slice(0, MAX_CHANNELS),
	);
}

export const useChannelCoordinatorStore = create<ChannelCoordinatorState>()(
	persist(
		(set) => {
			const patch = (
				channelId: string,
				change: (
					coordinator: ChannelCoordinator,
				) => Partial<ChannelCoordinator>,
			) =>
				set((state) => {
					const current = state.byChannelId[channelId];
					if (!current) return state;
					return {
						byChannelId: {
							...state.byChannelId,
							[channelId]: { ...current, ...change(current) },
						},
					};
				});
			return {
				byChannelId: {},
				settingsByChannelId: {},
				link: (channelId, coordinator) =>
					set((state) => ({
						byChannelId: bounded(
							{
								...state.byChannelId,
								[channelId]: { ...coordinator, linkedAt: Date.now() },
							},
							(entry) => entry.linkedAt,
						),
					})),
				setSessionId: (channelId, sessionId) =>
					patch(channelId, () => ({ sessionId })),
				setPendingPrompts: (channelId, pendingPrompts) =>
					patch(channelId, () => ({ pendingPrompts })),
				unlink: (channelId) =>
					set((state) => {
						const { [channelId]: _, ...rest } = state.byChannelId;
						return { byChannelId: rest };
					}),
				setSettings: (channelId, change) =>
					set((state) => {
						const current = state.settingsByChannelId[channelId] ?? {
							agentId: DEFAULT_COORDINATOR_AGENT,
							instructions: "",
							updatedAt: 0,
						};
						return {
							settingsByChannelId: bounded(
								{
									...state.settingsByChannelId,
									[channelId]: { ...current, ...change, updatedAt: Date.now() },
								},
								(entry) => entry.updatedAt,
							),
						};
					}),
			};
		},
		{ name: CHANNEL_COORDINATORS_STORAGE_KEY },
	),
);
