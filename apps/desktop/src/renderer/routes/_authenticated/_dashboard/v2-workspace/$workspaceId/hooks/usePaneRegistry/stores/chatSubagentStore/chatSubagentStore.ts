import { create } from "zustand";

export type SubagentCrumb = { id: string; title: string };

interface ChatSubagentStore {
	opened: Record<string, string>;
	paths: Record<string, readonly SubagentCrumb[]>;
	open: (chatKey: string, itemId: string | null) => void;
	setPath: (chatKey: string, path: readonly SubagentCrumb[]) => void;
	forget: (chatKey: string) => void;
}

function samePath(
	previous: readonly SubagentCrumb[] | undefined,
	next: readonly SubagentCrumb[],
): boolean {
	if (!previous) return next.length === 0;
	return (
		previous.length === next.length &&
		previous.every(
			(crumb, index) =>
				crumb.id === next[index]?.id && crumb.title === next[index]?.title,
		)
	);
}

export const useChatSubagentStore = create<ChatSubagentStore>()((set) => ({
	opened: {},
	paths: {},
	open: (chatKey, itemId) =>
		set((state) => {
			if ((state.opened[chatKey] ?? null) === itemId) return state;
			const { [chatKey]: _closed, ...rest } = state.opened;
			return { opened: itemId ? { ...rest, [chatKey]: itemId } : rest };
		}),
	setPath: (chatKey, path) =>
		set((state) => {
			if (samePath(state.paths[chatKey], path)) return state;
			const { [chatKey]: _cleared, ...rest } = state.paths;
			return { paths: path.length > 0 ? { ...rest, [chatKey]: path } : rest };
		}),
	forget: (chatKey) =>
		set((state) => {
			if (!(chatKey in state.opened) && !(chatKey in state.paths)) return state;
			const { [chatKey]: _opened, ...opened } = state.opened;
			const { [chatKey]: _path, ...paths } = state.paths;
			return { opened, paths };
		}),
}));
