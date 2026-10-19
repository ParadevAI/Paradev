import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Past any number of surfaces a phone opens, but finite: nothing tells this
 * device that a workspace was deleted elsewhere.
 */
const MAX_REMEMBERED_DRAFTS = 50;

/**
 * What each composer surface had typed or dictated, kept across launches so a
 * crash, a kill or a long dictation that failed does not take the text with
 * it. Apart from `composerDraftsStore` because attachments must not persist and
 * their upload ticks would otherwise write to disk many times a second.
 */
interface ComposerDraftTextStore {
	textByKey: Record<string, string>;
	/** False until AsyncStorage answers — an empty draft would win the race. */
	hasHydrated: boolean;
	setText: (key: string, text: string) => void;
	/** Drafts belong to the account that wrote them. */
	forget: () => void;
}

export const useComposerDraftTextStore = create<ComposerDraftTextStore>()(
	persist(
		(set) => ({
			textByKey: {},
			hasHydrated: false,
			setText: (key, text) => {
				set((state) => {
					// Re-inserted so key order stays least recently written first,
					// and the eviction below drops the draft left longest.
					const { [key]: _previous, ...rest } = state.textByKey;
					if (!text) return { textByKey: rest };
					const textByKey = { ...rest, [key]: text };
					const overflow = Object.keys(textByKey).slice(
						0,
						-MAX_REMEMBERED_DRAFTS,
					);
					for (const stale of overflow) delete textByKey[stale];
					return { textByKey };
				});
			},
			forget: () => set({ textByKey: {} }),
		}),
		{
			name: "composer-draft-text-v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ textByKey }) => ({ textByKey }),
			// Typed before the saved map arrived: the keystroke is newer.
			merge: (saved, current) => ({
				...current,
				textByKey: {
					...(saved as Partial<ComposerDraftTextStore> | undefined)?.textByKey,
					...current.textByKey,
				},
			}),
			// Flips on storage errors too, so a failed read still lets the
			// composer start empty instead of waiting forever.
			onRehydrateStorage: () => () =>
				useComposerDraftTextStore.setState({ hasHydrated: true }),
		},
	),
);
