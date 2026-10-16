/**
 * Stands in for renderer/lib/trpc-storage under Storybook. The stores that
 * persist through the main process (theme, tabs, ringtone) keep their
 * defaults in memory instead of asking an IPC bridge Storybook doesn't have.
 */
import { createJSONStorage, type StateStorage } from "zustand/middleware";

const memory = (): StateStorage => {
	const values = new Map<string, string>();
	return {
		getItem: (name) => values.get(name) ?? null,
		setItem: (name, value) => {
			values.set(name, value);
		},
		removeItem: (name) => {
			values.delete(name);
		},
	};
};

export const trpcTabsStorage = createJSONStorage(memory);
export const trpcThemeStorage = createJSONStorage(memory);
export const trpcRingtoneStorage = createJSONStorage(memory);
