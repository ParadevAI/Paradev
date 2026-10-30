import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import {
	useChatTurnSnapshotsEnabled,
	useChatTurnSnapshotsStore,
} from "renderer/stores/chat-turn-snapshots";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function ChatTurnSnapshotsSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const acpChatEnabled = useAcpChatEnabled();
	const enabled = useChatTurnSnapshotsEnabled();
	const setEnabled = useChatTurnSnapshotsStore((state) => state.setEnabled);
	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="chat-turn-snapshots" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Track file changes per turn" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Snapshot the worktree before and after each chat turn, so its card lists every changed file, shell edits included, and can undo them. Each prompt waits for its snapshot first.",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<Switch
				id="chat-turn-snapshots"
				checked={enabled}
				disabled={!acpChatEnabled}
				onCheckedChange={setEnabled}
			/>
		</div>
	);
}
