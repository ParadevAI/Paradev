import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useId } from "react";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function ActivityPanelSection() {
	const { t } = useLingui();
	const { preferences, setShowActivityPanelAutomatically } =
		useUserPreferences();
	const searchQuery = useSettingsSearchQuery();
	const id = useId();

	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<Label htmlFor={id} className="min-w-0 text-sm font-medium">
				<HighlightText
					text={t({ message: "Show activity panel automatically" })}
					query={searchQuery}
				/>
			</Label>
			<Switch
				id={id}
				checked={preferences.showActivityPanelAutomatically}
				onCheckedChange={setShowActivityPanelAutomatically}
			/>
		</div>
	);
}
