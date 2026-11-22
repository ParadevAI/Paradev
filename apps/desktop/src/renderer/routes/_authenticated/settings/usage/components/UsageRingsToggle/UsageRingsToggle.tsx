import { Trans } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useSettings } from "renderer/stores/settings";

export function UsageRingsToggle() {
	const isShown = useSettings((s) => s.showRailUsage);
	const updateSetting = useSettings((s) => s.update);

	return (
		<div className="flex shrink-0 items-center gap-3">
			<Label
				htmlFor="usage-rail-rings"
				className="text-xs text-muted-foreground"
			>
				<Trans>Show quota rings on sidebar</Trans>
			</Label>
			<span id="usage-rail-rings-description" className="sr-only">
				<Trans>
					Show how much quota each model provider has used, at the bottom of the
					sidebar
				</Trans>
			</span>
			<Switch
				id="usage-rail-rings"
				aria-describedby="usage-rail-rings-description"
				checked={isShown}
				onCheckedChange={(shown) => updateSetting("showRailUsage", shown)}
			/>
		</div>
	);
}
