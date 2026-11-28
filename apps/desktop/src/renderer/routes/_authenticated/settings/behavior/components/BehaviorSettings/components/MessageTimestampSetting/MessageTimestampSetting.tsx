import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettings } from "renderer/stores/settings";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function MessageTimestampSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const shown = useSettings((s) => s.showMessageTimestamps);
	const updateSetting = useSettings((s) => s.update);

	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="message-timestamps" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Message timestamps" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Show the time of each Chat message. Hover a time to see its full date.",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<Switch
				id="message-timestamps"
				checked={shown}
				onCheckedChange={(enabled) =>
					updateSetting("showMessageTimestamps", enabled)
				}
			/>
		</div>
	);
}
