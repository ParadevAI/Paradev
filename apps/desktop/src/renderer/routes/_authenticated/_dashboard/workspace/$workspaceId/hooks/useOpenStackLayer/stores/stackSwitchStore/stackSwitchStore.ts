import type { PullRequestStackLayer } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStack";
import { create } from "zustand";

export interface StackSwitch {
	layer: PullRequestStackLayer;
	/** False once git is on the branch and only the status is still loading. */
	isCheckingOut: boolean;
}

interface StackSwitchState {
	switchByWorkspace: Record<string, StackSwitch>;
	begin: (workspaceId: string, layer: PullRequestStackLayer) => void;
	checkedOut: (workspaceId: string, number: number) => void;
	/** Clears only the switch to `number`, so a newer one stays. */
	end: (workspaceId: string, number: number) => void;
}

export const useStackSwitchStore = create<StackSwitchState>((set) => ({
	switchByWorkspace: {},
	begin: (workspaceId, layer) =>
		set((state) => ({
			switchByWorkspace: {
				...state.switchByWorkspace,
				[workspaceId]: { layer, isCheckingOut: true },
			},
		})),
	checkedOut: (workspaceId, number) =>
		set((state) => {
			const current = state.switchByWorkspace[workspaceId];
			if (current?.layer.number !== number) return state;
			return {
				switchByWorkspace: {
					...state.switchByWorkspace,
					[workspaceId]: { ...current, isCheckingOut: false },
				},
			};
		}),
	end: (workspaceId, number) =>
		set((state) => {
			if (state.switchByWorkspace[workspaceId]?.layer.number !== number) {
				return state;
			}
			const { [workspaceId]: _, ...rest } = state.switchByWorkspace;
			return { switchByWorkspace: rest };
		}),
}));
