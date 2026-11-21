import { Trans } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import { useSettings } from "renderer/stores/settings";

export function CodexUsageSettings() {
	const location = useSettings((settings) => settings.codexUsageLocation);
	const thresholdEnabled = useSettings(
		(settings) => settings.codexUsageThresholdEnabled,
	);
	const threshold = useSettings((settings) => settings.codexUsageThreshold);
	const update = useSettings((settings) => settings.update);
	const { setShowPresetsBar } = useUserPreferences();
	const [draft, setDraft] = useState<string | null>(null);

	return (
		<div className="flex flex-col gap-3 rounded-lg border px-4 py-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Label htmlFor="codex-usage-location">
					<Trans>Codex usage indicator</Trans>
				</Label>
				<Select
					value={location}
					onValueChange={(value) => {
						if (value !== "session" && value !== "preset") return;
						update("codexUsageLocation", value);
						if (value === "preset") setShowPresetsBar(true);
					}}
				>
					<SelectTrigger
						id="codex-usage-location"
						size="sm"
						className="min-w-40"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="session">
							<Trans>Session header</Trans>
						</SelectItem>
						<SelectItem value="preset">
							<Trans>Codex button</Trans>
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{location === "session" && (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Switch
							id="codex-usage-threshold-enabled"
							checked={thresholdEnabled}
							onCheckedChange={(enabled) =>
								update("codexUsageThresholdEnabled", enabled)
							}
						/>
						<Label htmlFor="codex-usage-threshold-enabled" className="text-xs">
							<Trans>Only show at or above a threshold</Trans>
						</Label>
					</div>
					{thresholdEnabled && (
						<div className="flex items-center gap-2">
							<Label htmlFor="codex-usage-threshold" className="text-xs">
								<Trans>Threshold (%)</Trans>
							</Label>
							<Input
								id="codex-usage-threshold"
								type="number"
								min={1}
								max={100}
								step={1}
								className="h-8 w-20"
								value={draft ?? String(threshold)}
								onChange={(event) => setDraft(event.currentTarget.value)}
								onBlur={(event) => {
									const value = event.currentTarget.valueAsNumber;
									if (Number.isInteger(value) && value >= 1 && value <= 100) {
										update("codexUsageThreshold", value);
									}
									setDraft(null);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") event.currentTarget.blur();
								}}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
