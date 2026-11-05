import { create } from "zustand";

export type AgentMode = "terminal" | "chat";

interface AgentModeState {
	picked: AgentMode | null;
	setPicked: (mode: AgentMode | null) => void;
	reset: () => void;
}

export const useAgentModeStore = create<AgentModeState>((set) => ({
	picked: null,
	setPicked: (mode) => set({ picked: mode }),
	reset: () => set({ picked: null }),
}));
