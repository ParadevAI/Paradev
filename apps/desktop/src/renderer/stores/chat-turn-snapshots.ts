import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: snapshot the worktree around each ACP chat turn, for the turn's
 * changes card and its Undo. Off by default; the toggle shows only with the
 * `acp-chat` flag.
 *
 * To conclude the experiment, remove: this store, moving its
 * `chat-turn-snapshots` key to `DEAD_KEYS` in `lib/persisted-keys`; its toggle
 * in `ExperimentalSettings` and its `settings-search` entry
 * (`EXPERIMENTAL_CHAT_TURN_SNAPSHOTS`); and pass `snapshotWorktree` from the
 * outcome instead.
 */
interface ChatTurnSnapshotsState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useChatTurnSnapshotsStore = create<ChatTurnSnapshotsState>()(
	devtools(
		persist(
			(set) => ({
				enabled: false,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "chat-turn-snapshots" },
		),
		{ name: "ChatTurnSnapshotsStore" },
	),
);

export function useChatTurnSnapshotsEnabled(): boolean {
	const flag = useFeatureFlagEnabled(FEATURE_FLAGS.ACP_CHAT) === true;
	const enabled = useChatTurnSnapshotsStore((state) => state.enabled);
	return flag && enabled;
}
