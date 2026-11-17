import { create } from "zustand";

interface OnboardingRestartState {
	restarting: boolean;
	start: () => void;
	end: () => void;
}

export const useOnboardingRestartStore = create<OnboardingRestartState>(
	(set) => ({
		restarting: false,
		start: () => set({ restarting: true }),
		end: () => set({ restarting: false }),
	}),
);
