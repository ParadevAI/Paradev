import { create } from "zustand";

/**
 * A host setup link waiting for SetUpOverSshDialog. Kept in memory only: the
 * address can hold a login token, so it never goes into the router history.
 */
interface SetUpHostOverSshIntentState {
	link: { target: string | null } | null;
	request: (target: string | null) => void;
	clear: () => void;
}

export const useSetUpHostOverSshIntent = create<SetUpHostOverSshIntentState>(
	(set) => ({
		link: null,
		request: (target) => set({ link: { target } }),
		clear: () => set({ link: null }),
	}),
);
