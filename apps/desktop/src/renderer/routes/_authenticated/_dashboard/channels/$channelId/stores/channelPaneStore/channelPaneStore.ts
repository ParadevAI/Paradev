import { create } from "zustand";
import { persist } from "zustand/middleware";

export const CHANNEL_PANES_STORAGE_KEY = "channel-panes-v2";
const MAX_CHANNELS = 20;
const MAX_DEPTH = 6;

/**
 * A page in a channel's side pane. The root (the channel's overview, or a
 * Dev's profile) is the empty stack, so it is never stored.
 */
export type ChannelPanePage =
	| { kind: "thread"; id: string }
	| { kind: "task"; id: string }
	| { kind: "profile"; id: string }
	| { kind: "agent"; id: string }
	| { kind: "members" }
	| { kind: "tasks" }
	| { kind: "settings" }
	| { kind: "activity" }
	| { kind: "routines" }
	| { kind: "coordinator" }
	| { kind: "pullRequests" };

interface ChannelPane {
	stack: ChannelPanePage[];
	isOpen: boolean;
	touchedAt: number;
}

interface ChannelPaneState {
	panes: Record<string, ChannelPane>;
	/** Pane width in px; null until the user resizes it. */
	width: number | null;
	/** Shows the page on top of the stack and opens the pane. A page of the same kind on top is replaced, so reading one thread after another does not pile up. */
	push: (channelId: string, page: ChannelPanePage) => void;
	pop: (channelId: string) => void;
	reset: (channelId: string) => void;
	setOpen: (channelId: string, isOpen: boolean) => void;
	setWidth: (width: number | null) => void;
}

const EMPTY: ChannelPane = { stack: [], isOpen: false, touchedAt: 0 };

export const samePage = (a: ChannelPanePage, b: ChannelPanePage) =>
	a.kind === b.kind && ("id" in a ? a.id : null) === ("id" in b ? b.id : null);

/** Keeps the most recently used channels; older ones lose their stack. */
function bounded(
	panes: Record<string, ChannelPane>,
): Record<string, ChannelPane> {
	const entries = Object.entries(panes);
	if (entries.length <= MAX_CHANNELS) return panes;
	return Object.fromEntries(
		entries
			.sort((a, b) => b[1].touchedAt - a[1].touchedAt)
			.slice(0, MAX_CHANNELS),
	);
}

export const useChannelPaneStore = create<ChannelPaneState>()(
	persist(
		(set) => {
			const update = (
				channelId: string,
				change: (pane: ChannelPane) => Partial<ChannelPane>,
			) =>
				set((state) => {
					const pane = state.panes[channelId] ?? EMPTY;
					return {
						panes: bounded({
							...state.panes,
							[channelId]: {
								...pane,
								...change(pane),
								touchedAt: Date.now(),
							},
						}),
					};
				});
			return {
				panes: {},
				width: null,
				push: (channelId, page) =>
					update(channelId, (pane) => {
						const top = pane.stack.at(-1);
						if (top && samePage(top, page)) return { isOpen: true };
						const kept =
							top?.kind === page.kind ? pane.stack.slice(0, -1) : pane.stack;
						return {
							stack: [...kept, page].slice(-MAX_DEPTH),
							isOpen: true,
						};
					}),
				pop: (channelId) =>
					update(channelId, (pane) => ({ stack: pane.stack.slice(0, -1) })),
				reset: (channelId) => update(channelId, () => ({ stack: [] })),
				setOpen: (channelId, isOpen) => update(channelId, () => ({ isOpen })),
				setWidth: (width) => set({ width }),
			};
		},
		{ name: CHANNEL_PANES_STORAGE_KEY },
	),
);
