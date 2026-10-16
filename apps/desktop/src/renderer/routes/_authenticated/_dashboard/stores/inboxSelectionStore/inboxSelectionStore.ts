import type { RouterOutputs } from "@superset/trpc";
import { create } from "zustand";

type ListCard = RouterOutputs["inbox"]["list"]["items"][number];

interface InboxSelectionState {
	/** The ids of the rows the inbox list shows, top to bottom. */
	order: string[];
	setOrder: (order: string[]) => void;
	/** The row the detail pane shows. It moves here first; the route follows. */
	selectedId: string | null;
	setSelected: (selectedId: string | null) => void;
	/** What the list already holds about each card, so a card opens before its own load returns. */
	cards: Record<string, ListCard>;
	setCards: (cards: Record<string, ListCard>) => void;
}

export const useInboxSelectionStore = create<InboxSelectionState>()((set) => ({
	order: [],
	setOrder: (order) => set({ order }),
	selectedId: null,
	setSelected: (selectedId) => set({ selectedId }),
	cards: {},
	setCards: (cards) => set({ cards }),
}));
