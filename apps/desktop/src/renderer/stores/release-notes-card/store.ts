import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface ReleaseNotesCardState {
	/** Newest release whose card the user closed; older releases stay hidden too. */
	dismissedVersion: string | null;
	/** Dev-only: forces the card to show, bypassing version history and dismissal. Not persisted. */
	isPreviewing: boolean;
	dismiss: (version: string) => void;
	setPreviewing: (isPreviewing: boolean) => void;
}

export const useReleaseNotesCardStore = create<ReleaseNotesCardState>()(
	devtools(
		persist(
			(set) => ({
				dismissedVersion: null,
				isPreviewing: false,
				dismiss: (version) => set({ dismissedVersion: version }),
				setPreviewing: (isPreviewing) => set({ isPreviewing }),
			}),
			{
				name: "release-notes-card-v1",
				partialize: ({ dismissedVersion }) => ({ dismissedVersion }),
			},
		),
		{ name: "ReleaseNotesCardStore" },
	),
);
