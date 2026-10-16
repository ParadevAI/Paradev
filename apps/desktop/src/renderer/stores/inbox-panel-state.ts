import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const INBOX_PANEL_DEFAULT_WIDTH = 400;
export const INBOX_PANEL_MIN_WIDTH = 320;
export const INBOX_PANEL_MAX_WIDTH = 640;
export const INBOX_PANEL_STORAGE_KEY = "inbox-panel-store";

export type InboxView = "open" | "scheduled" | "archive";

interface InboxPanelState {
	isOpen: boolean;
	view: InboxView;
	showUpdates: boolean;
	showFinished: boolean;
	width: number;
	toggleOpen: () => void;
	setOpen: (open: boolean) => void;
	setView: (view: InboxView) => void;
	setShowUpdates: (show: boolean) => void;
	setShowFinished: (show: boolean) => void;
	setWidth: (width: number) => void;
}

export const useInboxPanelStore = create<InboxPanelState>()(
	devtools(
		persist(
			(set, get) => ({
				isOpen: false,
				view: "open",
				showUpdates: true,
				showFinished: true,
				width: INBOX_PANEL_DEFAULT_WIDTH,
				toggleOpen: () => set({ isOpen: !get().isOpen }),
				setOpen: (open) => set({ isOpen: open }),
				setView: (view) => set({ view }),
				setShowFinished: (showFinished) => set({ showFinished }),
				setShowUpdates: (showUpdates) => set({ showUpdates }),
				setWidth: (width) => set({ width }),
			}),
			{
				name: INBOX_PANEL_STORAGE_KEY,
				partialize: (state) => ({
					isOpen: state.isOpen,
					view: state.view,
					showUpdates: state.showUpdates,
					showFinished: state.showFinished,
					width: state.width,
				}),
			},
		),
		{ name: "InboxPanelStore" },
	),
);
