import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useSettings } from "renderer/stores/settings";
import {
	QUOTA_AGENT_LABELS,
	QUOTA_AGENT_ORDER,
} from "renderer/utils/usage/quotaAgentLabels";

export function UsageRingsToggle() {
	const isShown = useSettings((s) => s.showRailUsage);
	const updateSetting = useSettings((s) => s.update);
	const hiddenProviders = useSettings((s) => s.hiddenRailUsageProviders);
	const toggleProvider = useSettings((s) => s.toggleRailUsageProvider);

	return (
		<div className="flex shrink-0 items-center gap-3">
			<Label
				id="usage-rail-rings-label"
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
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						disabled={!isShown}
						aria-describedby="usage-rail-rings-label"
					>
						<Trans>Customize</Trans>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{QUOTA_AGENT_ORDER.map((agent) => (
						<DropdownMenuCheckboxItem
							key={agent}
							checked={!hiddenProviders.includes(agent)}
							onCheckedChange={() => toggleProvider(agent)}
							onSelect={(event) => event.preventDefault()}
						>
							{QUOTA_AGENT_LABELS[agent]}
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
