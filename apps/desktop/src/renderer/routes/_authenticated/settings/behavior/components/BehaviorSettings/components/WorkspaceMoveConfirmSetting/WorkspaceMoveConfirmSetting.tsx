import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { useWorkspaceMoveConfirmStore } from "renderer/stores/workspace-move-confirm/store";

export function WorkspaceMoveConfirmSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const suppressed = useWorkspaceMoveConfirmStore((state) => state.suppressed);
	const suppress = useWorkspaceMoveConfirmStore((state) => state.suppress);
	const reset = useWorkspaceMoveConfirmStore((state) => state.reset);

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="workspace-move-confirm" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Confirm before moving a workspace" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Explain what a move does before a workspace moves to another
						computer
					</Trans>
				</p>
			</div>
			<Switch
				id="workspace-move-confirm"
				checked={!suppressed}
				onCheckedChange={(checked) => (checked ? reset() : suppress())}
				className="shrink-0"
			/>
		</div>
	);
}
