import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { useTerminalCloseConfirmStore } from "renderer/stores/terminal-close-confirm/store";

export function CloseConfirmSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const suppressed = useTerminalCloseConfirmStore((state) => state.suppressed);
	const suppress = useTerminalCloseConfirmStore((state) => state.suppress);
	const reset = useTerminalCloseConfirmStore((state) => state.reset);

	return (
		<div className="flex items-center justify-between gap-10">
			<div className="space-y-1">
				<Label htmlFor="terminal-close-confirm" className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Warn before closing a running terminal",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground max-w-md leading-relaxed">
					<Trans>
						Ask before you close a terminal, tab, or port that still has a
						process running in it
					</Trans>
				</p>
			</div>
			<Switch
				id="terminal-close-confirm"
				checked={!suppressed}
				onCheckedChange={(checked) => (checked ? reset() : suppress())}
				className="shrink-0"
			/>
		</div>
	);
}
