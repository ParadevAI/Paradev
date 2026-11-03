import { create } from "zustand";

export const FINISHED_LIMIT = 20;

export type FinishedSubagent = {
	key: string;
	name: string;
	terminalId: string;
	taskId: string;
	sessionId?: string;
	agentSessionId?: string;
};

const NO_FINISHED: readonly FinishedSubagent[] = [];

interface ActivityPanelStore {
	finished: Record<string, readonly FinishedSubagent[]>;
	asideNodes: Record<string, HTMLElement>;
	fits: Record<string, true>;
	setFits: (workspaceId: string, fits: boolean) => void;
	hidden: Record<string, true>;
	setHidden: (workspaceId: string, hidden: boolean) => void;
	stoppedKeys: ReadonlySet<string>;
	noteStopped: (key: string) => void;
	forgetStopped: (keys: readonly string[]) => void;
	setAsideNode: (workspaceId: string, node: HTMLElement) => void;
	clearAsideNode: (workspaceId: string, node: HTMLElement) => void;
	anchorNodes: Record<string, HTMLElement>;
	setAnchorNode: (workspaceId: string, node: HTMLElement) => void;
	clearAnchorNode: (workspaceId: string, node: HTMLElement) => void;
	recordFinished: (
		workspaceId: string,
		entries: readonly FinishedSubagent[],
	) => void;
}

export const useActivityPanelStore = create<ActivityPanelStore>()((set) => ({
	finished: {},
	asideNodes: {},
	fits: {},
	setFits: (workspaceId, fits) =>
		set((state) => {
			if ((state.fits[workspaceId] === true) === fits) return state;
			const { [workspaceId]: _previous, ...rest } = state.fits;
			return { fits: fits ? { ...rest, [workspaceId]: true } : rest };
		}),
	hidden: {},
	setHidden: (workspaceId, hidden) =>
		set((state) => {
			if ((state.hidden[workspaceId] === true) === hidden) return state;
			const { [workspaceId]: _previous, ...rest } = state.hidden;
			return { hidden: hidden ? { ...rest, [workspaceId]: true } : rest };
		}),
	stoppedKeys: new Set(),
	noteStopped: (key) =>
		set((state) => ({ stoppedKeys: new Set(state.stoppedKeys).add(key) })),
	forgetStopped: (keys) =>
		set((state) => {
			if (!keys.some((key) => state.stoppedKeys.has(key))) return state;
			const stoppedKeys = new Set(state.stoppedKeys);
			for (const key of keys) stoppedKeys.delete(key);
			return { stoppedKeys };
		}),
	setAsideNode: (workspaceId, node) =>
		set((state) =>
			state.asideNodes[workspaceId] === node
				? state
				: { asideNodes: { ...state.asideNodes, [workspaceId]: node } },
		),
	clearAsideNode: (workspaceId, node) =>
		set((state) => {
			if (state.asideNodes[workspaceId] !== node) return state;
			const { [workspaceId]: _cleared, ...asideNodes } = state.asideNodes;
			return { asideNodes };
		}),
	anchorNodes: {},
	setAnchorNode: (workspaceId, node) =>
		set((state) =>
			state.anchorNodes[workspaceId] === node
				? state
				: { anchorNodes: { ...state.anchorNodes, [workspaceId]: node } },
		),
	clearAnchorNode: (workspaceId, node) =>
		set((state) => {
			if (state.anchorNodes[workspaceId] !== node) return state;
			const { [workspaceId]: _cleared, ...anchorNodes } = state.anchorNodes;
			return { anchorNodes };
		}),
	recordFinished: (workspaceId, entries) =>
		set((state) => {
			if (entries.length === 0) return state;
			const keys = new Set(entries.map((entry) => entry.key));
			const kept = (state.finished[workspaceId] ?? NO_FINISHED).filter(
				(entry) => !keys.has(entry.key),
			);
			return {
				finished: {
					...state.finished,
					[workspaceId]: [...entries, ...kept].slice(0, FINISHED_LIMIT),
				},
			};
		}),
}));

export const useFinishedSubagents = (workspaceId: string) =>
	useActivityPanelStore((state) => state.finished[workspaceId] ?? NO_FINISHED);
