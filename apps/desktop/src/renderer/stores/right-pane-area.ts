import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: the right pane area (files, diffs and browsers open in tabs on
 * the right; the center keeps terminals and chats). Needs the
 * `right-pane-area` flag; with it on, `enabled` is null until the person sets
 * it, and null means on.
 *
 * To conclude the experiment, remove: this store, its toggle in
 * `ExperimentalSettings` and its `settings-search` entry
 * (`EXPERIMENTAL_RIGHT_PANE_AREA`), and read the flag directly again.
 */
interface RightPaneAreaState {
	enabled: boolean | null;
	setEnabled: (enabled: boolean) => void;
}

export const useRightPaneAreaStore = create<RightPaneAreaState>()(
	devtools(
		persist(
			(set) => ({
				enabled: null,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "right-pane-area" },
		),
		{ name: "RightPaneAreaStore" },
	),
);

/**
 * Single read path for the right pane area. Undefined while the flag loads:
 * the pane-area lifecycle moves panes between areas on true and false, and
 * must not act on a flag that hasn't answered yet.
 */
export function useRightPaneAreaEnabled(): boolean | undefined {
	const flag = useFeatureFlagEnabled(FEATURE_FLAGS.RIGHT_PANE_AREA);
	const chosen = useRightPaneAreaStore((state) => state.enabled);
	if (flag !== true) return flag;
	return chosen ?? true;
}
