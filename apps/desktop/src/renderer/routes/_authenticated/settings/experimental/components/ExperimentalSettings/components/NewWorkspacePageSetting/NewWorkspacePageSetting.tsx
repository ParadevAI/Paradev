import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import {
	useNewWorkspacePageEnabled,
	useNewWorkspacePageStore,
} from "renderer/stores/new-workspace-page";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function NewWorkspacePageSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const enabled = useNewWorkspacePageEnabled();
	const setEnabled = useNewWorkspacePageStore((state) => state.setEnabled);

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="new-workspace-page" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "New workspace page" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Use the redesigned New Workspace page: the prompt box in the middle, with project and branch pickers above it.",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<Switch
				id="new-workspace-page"
				checked={enabled}
				onCheckedChange={setEnabled}
			/>
		</div>
	);
}
