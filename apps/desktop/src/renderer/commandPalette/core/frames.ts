import { track } from "renderer/lib/analytics";
import type { V2WorkspaceHostType } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { create } from "zustand";
import type { SwitcherBucket } from "../ui/WorkspaceList/utils/bucketWorkspaces";
import type { Command } from "./types";

export interface Frame {
	command: Command;
}

export type PaletteRoot = "commands" | "switcher";

export type SwitcherOpenedVia = "hotkey" | "pill" | "command";

export interface SwitcherSelection {
	id: string;
	name: string;
	hostType: V2WorkspaceHostType;
	bucket: SwitcherBucket;
	index: number;
}

interface FrameStackState {
	open: boolean;
	root: PaletteRoot;
	frames: Frame[];
	/** Counts switcher-hotkey presses while the switcher is open; the list advances on each. */
	switcherStep: number;
	/** Armed once a further hotkey press steps while the modifier is held: releasing it then switches. */
	switcherHold: boolean;
	switcherSelection: SwitcherSelection | null;
	setOpen: (open: boolean) => void;
	openSwitcher: (options: {
		via: SwitcherOpenedVia;
		holdsModifier: boolean;
	}) => void;
	stepSwitcher: (holdsModifier: boolean) => void;
	releaseSwitcherHold: () => void;
	setSwitcherSelection: (selection: SwitcherSelection | null) => void;
	pushFrame: (command: Command) => void;
	popFrame: () => void;
	reset: () => void;
}

const CLOSED = {
	open: false,
	root: "commands" as const,
	frames: [],
	switcherStep: 0,
	switcherHold: false,
	switcherSelection: null,
};

export const useFrameStackStore = create<FrameStackState>((set) => ({
	...CLOSED,
	setOpen: (open) =>
		set((state) => {
			if (open) {
				if (!state.open) track("command_palette_opened");
				return { open: true, root: "commands", switcherHold: false };
			}
			return CLOSED;
		}),
	openSwitcher: ({ via, holdsModifier }) =>
		set((state) => {
			if (!state.open || state.root !== "switcher") {
				track("workspace_switcher_opened", { via, holdsModifier });
			}
			return {
				open: true,
				root: "switcher",
				frames: [],
				switcherStep: 0,
				switcherHold: false,
				switcherSelection: null,
			};
		}),
	stepSwitcher: (holdsModifier) =>
		set((state) => ({
			switcherStep: state.switcherStep + 1,
			switcherHold: holdsModifier,
		})),
	releaseSwitcherHold: () => set({ switcherHold: false }),
	setSwitcherSelection: (switcherSelection) =>
		set((state) =>
			state.switcherSelection?.id === switcherSelection?.id &&
			state.switcherSelection?.index === switcherSelection?.index
				? state
				: { switcherSelection },
		),
	pushFrame: (command) =>
		set((state) => ({ frames: [...state.frames, { command }] })),
	popFrame: () => set((state) => ({ frames: state.frames.slice(0, -1) })),
	reset: () => set({ frames: [] }),
}));
