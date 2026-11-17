import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useParadevShellStore } from "renderer/stores/paradev-shell";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function NewLayoutSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const activeThisLaunch = useParadevShell();
	const enabled = useParadevShellStore((state) => state.enabled);
	const setEnabled = useParadevShellStore((state) => state.setEnabled);
	const needsReload = enabled !== activeThisLaunch;

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="new-layout" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "New layout" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Use the redesigned window layout: an icon rail, tabs in the title bar, and panes as cards.",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-3">
				{needsReload && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => window.location.reload()}
					>
						<Trans>Reload to apply</Trans>
					</Button>
				)}
				<Switch
					id="new-layout"
					checked={enabled}
					onCheckedChange={setEnabled}
				/>
			</div>
		</div>
	);
}
