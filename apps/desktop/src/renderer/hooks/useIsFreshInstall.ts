import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

/** Returns whether this install was empty when first detected, or null if still resolving. */
export function useIsFreshInstall(): boolean | null {
	return useV2LocalOverrideStore((s) => s.isFreshInstall);
}
