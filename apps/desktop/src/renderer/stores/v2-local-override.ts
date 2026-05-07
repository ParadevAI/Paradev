import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface V2LocalOverrideState {
	optInV2: boolean | null;
	isFreshInstall: boolean | null;
	setOptInV2: (optInV2: boolean) => void;
	setIsFreshInstall: (isFreshInstall: boolean) => void;
}

export const useV2LocalOverrideStore = create<V2LocalOverrideState>()(
	devtools(
		persist(
			(set) => ({
				optInV2: null,
				isFreshInstall: null,
				setOptInV2: (optInV2) => set({ optInV2 }),
				setIsFreshInstall: (isFreshInstall) => set({ isFreshInstall }),
			}),
			{ name: "v2-local-override-v2" },
		),
		{ name: "V2LocalOverrideStore" },
	),
);
