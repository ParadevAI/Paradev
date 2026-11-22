import { create } from "zustand";

export interface ChatComposerTarget {
	addFiles(files: File[]): void;
}

interface MountedComposer {
	workspaceId: string;
	target: ChatComposerTarget;
	focusOrder: number;
}

let focusCount = 0;

interface ChatComposerStore {
	composers: Record<string, MountedComposer>;
	register: (
		id: string,
		workspaceId: string,
		target: ChatComposerTarget,
	) => void;
	markActive: (id: string) => void;
	unregister: (id: string) => void;
}

export const useChatComposerStore = create<ChatComposerStore>()((set) => ({
	composers: {},
	register: (id, workspaceId, target) =>
		set((state) => ({
			composers: {
				...state.composers,
				[id]: { workspaceId, target, focusOrder: 0 },
			},
		})),
	markActive: (id) =>
		set((state) => {
			const composer = state.composers[id];
			if (!composer) return state;
			return {
				composers: {
					...state.composers,
					[id]: { ...composer, focusOrder: ++focusCount },
				},
			};
		}),
	unregister: (id) =>
		set((state) => {
			const { [id]: _removed, ...rest } = state.composers;
			return { composers: rest };
		}),
}));

export function lastActiveChatComposer(
	composers: Record<string, MountedComposer>,
	workspaceId: string,
): ChatComposerTarget | null {
	let latest: MountedComposer | null = null;
	for (const composer of Object.values(composers)) {
		if (composer.workspaceId !== workspaceId) continue;
		if (!latest || composer.focusOrder > latest.focusOrder) {
			latest = composer;
		}
	}
	return latest?.target ?? null;
}
