import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

interface OrgBoardsToggleProps {
	checked: boolean;
	disabled: boolean;
	onCheckedChange: (enabled: boolean) => void;
}

export function OrgBoardsToggle({
	checked,
	disabled,
	onCheckedChange,
}: OrgBoardsToggleProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-start justify-between gap-6">
			<div className="space-y-1 flex-1">
				<Label htmlFor="leaderboard-org-boards" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Show me on my organizations' boards" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Teammates in your Superset organizations can see where you rank
						among them. Off by default.
					</Trans>
				</p>
			</div>
			<Switch
				id="leaderboard-org-boards"
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}
